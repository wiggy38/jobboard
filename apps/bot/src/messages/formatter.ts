import { ContractType, JobOffer, UserPlan } from '@prisma/client';
import { InteractiveButtonMessage, OutgoingMessage, TextMessage } from '../whatsapp/types';
import { buildOfferUrl, generateOfferToken } from '../services/tokenService';

const CONTRACT_LABELS: Record<ContractType, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage',
  ALTERNANCE: 'Alternance',
  FREELANCE: 'Freelance',
  BENEVOLE: 'Bénévolat',
  AUTRE: 'Autre',
};

const PREMIUM_PLANS: UserPlan[] = ['PREMIUM'];

function formatDeadline(date: Date | null): string {
  if (!date) return 'Non précisée';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}


function formatContact(job: JobOffer): string {
  if (job.applicationUrl) return 'Candidature via le bouton ci-dessous';
  if (job.contactEmail) return `${job.contactEmail.slice(0, 3)}***`;
  return 'Non précisé';
}

export function formatJobMessage(
  job: JobOffer,
  userPlan: UserPlan,
  userId: string,
): OutgoingMessage {
  const contractLabel = CONTRACT_LABELS[job.contractType];
  const deadline = formatDeadline(job.deadline);

  if (PREMIUM_PLANS.includes(userPlan)) {
    const token = generateOfferToken(job.id, userId);
    const webLink = buildOfferUrl(job.id, token);
    return {
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text:
            `💼 *${job.title}* — ${contractLabel}\n` +
            `📍 ${job.city} | 🏢 ${job.organization}\n` +
            `⏳ Clôture : ${deadline}\n` +
            `📎 ${formatContact(job)}`,
        },
        action: {
          name: 'cta_url',
          parameters: { display_text: '👉 Voir l\'offre', url: webLink },
        },
      },
    };
  }

  const freemiumToken = generateOfferToken(job.id, userId);
  const freemiumWebLink = buildOfferUrl(job.id, freemiumToken);

  return {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: {
        text:
          `💼 *${job.title}* — ${contractLabel}\n` +
          `📍 ${job.city}\n` +
          `⏳ Clôture : ${deadline}`,
      },
      action: {
        name: 'cta_url',
        parameters: { display_text: '👉 Voir l\'offre', url: freemiumWebLink },
      },
    },
  };
}

export function formatTeaserSummary(count: number): TextMessage {
  if (count === 0) {
    return {
      type: 'text',
      text: {
        body:
          "😔 Aucune nouvelle offre ne correspond à votre profil aujourd'hui.\n" +
          'Modifiez vos critères avec MODIFIER ou revenez demain !',
      },
    };
  }
  return {
    type: 'text',
    text: {
      body:
        `🎯 *${count} offre(s) correspondent à votre profil aujourd'hui.*\n` +
        'Je vous les envoie une par une 👇',
    },
  };
}

export function formatPaginationPrompt(remaining: number): InteractiveButtonMessage {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `✅ Voici les 5 premières offres. Il en reste *${remaining}*.` },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'suite', title: '▶️ Suite' },
          },
        ],
      },
    },
  };
}

export function formatNoMoreOffers(): TextMessage {
  return {
    type: 'text',
    text: {
      body:
        '✅ Vous avez vu toutes les offres disponibles pour votre profil.\n' +
        'Revenez demain en tapant *OFFRES* ou modifiez vos critères : *MODIFIER*',
    },
  };
}
