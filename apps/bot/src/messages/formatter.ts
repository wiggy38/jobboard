import { ContractType, JobOffer, UserPlan } from '@prisma/client';
import { InteractiveButtonMessage, OutgoingMessage, TextMessage } from '../whatsapp/types';
import { buildOfferUrl, generateOfferToken } from '../services/tokenService';
import {
  CLOSING_VARIANTS,
  INTRO_VARIANTS,
  NO_OFFERS_STREAK_VARIANT,
  NO_OFFERS_VARIANTS,
  pickRandom,
} from './variants';

const CONTRACT_LABELS: Record<ContractType, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage',
  ALTERNANCE: 'Alternance',
  FREELANCE: 'Freelance',
  BENEVOLE: 'Bénévolat',
  AUTRE: 'Autre',
};

const PREMIUM_PLANS: UserPlan[] = ['PREMIUM', 'ELITE'];

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

export function formatTeaserSummary(count: number, prenom?: string | null): TextMessage {
  return {
    type: 'text',
    text: { body: pickRandom(INTRO_VARIANTS)(prenom, count) },
  };
}

// Zéro offre ne correspond au profil aujourd'hui (à distinguer de formatNoMoreOffers,
// utilisée quand la pagination d'une liste déjà entamée est épuisée).
export function formatNoOffersToday(prenom: string | null | undefined, longStreak: boolean): TextMessage {
  return {
    type: 'text',
    text: {
      body: longStreak ? NO_OFFERS_STREAK_VARIANT(prenom) : pickRandom(NO_OFFERS_VARIANTS)(prenom),
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

export function formatNoMoreOffers(prenom?: string | null, nb?: number): TextMessage {
  return {
    type: 'text',
    text: { body: pickRandom(CLOSING_VARIANTS)(prenom, nb) },
  };
}
