<script lang="ts">
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// TPQ chart — 7 derniers jours, valeurs fixes (source: analytics cache)
	const TPQ_VALUES = [55, 62, 58, 71, 64, 60, 68];
	const TPQ_MAX = 71;
	const BAR_W = 28;
	const BAR_GAP = 12;
	const CHART_H = 100;
	const START_X = 6;

	function dayLabels(): string[] {
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - (6 - i));
			return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
		});
	}
	const days = dayLabels();

	// Offres par jour — 10 derniers jours
	const DAILY_BAR_W = 26;
	const DAILY_BAR_GAP = 8;
	const DAILY_CHART_H = 100;
	const DAILY_START_X = 6;
	const DAILY_DAYS = 10;

	function buildDailySeries(): { label: string; count: number }[] {
		const historyMap = new Map(
			(data.stats.offersDailyHistory ?? []).map((r) => [r.date, r.count])
		);
		return Array.from({ length: DAILY_DAYS }, (_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - (DAILY_DAYS - 1 - i));
			const iso = d.toISOString().slice(0, 10);
			const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
			return { label, count: historyMap.get(iso) ?? 0 };
		});
	}

	const dailySeries = buildDailySeries();
	const dailyMax = Math.max(...dailySeries.map((d) => d.count), 1);

	// Template budget alerts
	const ALERT_THRESHOLD = 0.65;
	const WARN_THRESHOLD = 0.60;

	const typeColor = (type: string, pct: number): string => {
		if (type === 'MATCH_PARFAIT' && pct > WARN_THRESHOLD) return '#ffbd59';
		return '#2b9964';
	};

	const typeLabel: Record<string, string> = {
		RELANCE: 'RELANCE',
		MATCH_PARFAIT: 'MATCH PARFAIT',
		NUDGE_PREMIUM: 'NUDGE PREMIUM',
	};

	const statusDot: Record<string, string> = { ok: '#2b9964', warn: '#ffbd59', error: '#ef4444' };
	const statusLabel: Record<string, string> = { ok: 'OK', warn: 'WARN', error: 'ERROR' };
</script>

<div class="dashboard">
	<h1>Tableau de bord</h1>

	<!-- 1. Métriques -->
	<div class="metrics-grid">
		<div class="metric-card">
			<span class="metric-label">Abonnés actifs</span>
			<span class="metric-value">{data.stats.activeUsers.toLocaleString('fr-FR')}</span>
		</div>
		<div class="metric-card">
			<span class="metric-label">TPQ aujourd'hui</span>
			<span class="metric-value">{data.stats.tpqToday} %</span>
		</div>
		<div class="metric-card metric-highlight">
			<span class="metric-label">Templates ce mois</span>
			<span class="metric-value">
				{data.stats.templatesSentThisMonth}
				<small>/ {data.stats.templateBudgetCap}</small>
			</span>
		</div>
	</div>

	<!-- 1b. Offres — compteurs par statut -->
	<div class="metrics-grid">
		<div class="metric-card">
			<span class="metric-label">Total offres</span>
			<span class="metric-value">{(data.stats.totalOffers ?? 0).toLocaleString('fr-FR')}</span>
		</div>
		<div class="metric-card metric-today">
			<span class="metric-label">Insérées aujourd'hui</span>
			<span class="metric-value metric-value--today">{data.stats.offersInsertedToday ?? 0}</span>
		</div>
		<div class="metric-card">
			<span class="metric-label">En attente</span>
			<span class="metric-value metric-value--pending">{data.stats.pendingOffers ?? 0}</span>
		</div>
		<div class="metric-card">
			<span class="metric-label">Actives</span>
			<span class="metric-value">{(data.stats.activeOffers ?? 0).toLocaleString('fr-FR')}</span>
		</div>
		<div class="metric-card">
			<span class="metric-label">Expirées</span>
			<span class="metric-value metric-value--muted">{(data.stats.expiredOffers ?? 0).toLocaleString('fr-FR')}</span>
		</div>
		<div class="metric-card">
			<span class="metric-label">Archivées</span>
			<span class="metric-value metric-value--muted">{(data.stats.archivedOffers ?? 0).toLocaleString('fr-FR')}</span>
		</div>
	</div>

	<!-- 2+3. Graphes côte à côte -->
	<div class="sections-row">
		<section class="section">
			<h2>TPQ — 7 derniers jours</h2>
			<div class="chart-wrap">
				<svg viewBox="0 0 280 140" width="100%" class="tpq-chart" aria-label="Graphe TPQ sur 7 jours">
					{#each TPQ_VALUES as val, i}
						{@const x = START_X + i * (BAR_W + BAR_GAP)}
						{@const bh = Math.round((val / TPQ_MAX) * CHART_H)}
						<rect
							x={x}
							y={108 - bh}
							width={BAR_W}
							height={bh}
							rx="4"
							fill={i === 6 ? '#2b9964' : '#c2e5d4'}
						/>
						<text x={x + BAR_W / 2} y="125" text-anchor="middle" class="chart-day">{days[i]}</text>
						<text
							x={x + BAR_W / 2}
							y={108 - bh - 5}
							text-anchor="middle"
							class="chart-val"
							fill={i === 6 ? '#2b9964' : '#9ca3af'}
						>{val}%</text>
					{/each}
				</svg>
			</div>
		</section>

		<section class="section">
			<h2>Offres insérées — 10 derniers jours</h2>
			<div class="chart-wrap chart-wrap--wide">
				<svg
					viewBox="0 0 {DAILY_START_X * 2 + DAILY_DAYS * (DAILY_BAR_W + DAILY_BAR_GAP) - DAILY_BAR_GAP} 150"
					width="100%"
					class="daily-chart"
					aria-label="Offres insérées par jour sur 10 jours"
				>
					{#each dailySeries as { label, count }, i}
						{@const x = DAILY_START_X + i * (DAILY_BAR_W + DAILY_BAR_GAP)}
						{@const bh = count === 0 ? 2 : Math.round((count / dailyMax) * DAILY_CHART_H)}
						{@const isToday = i === DAILY_DAYS - 1}
						<rect
							x={x}
							y={108 - bh}
							width={DAILY_BAR_W}
							height={bh}
							rx="4"
							fill={isToday ? '#2b9964' : '#c2e5d4'}
						/>
						{#if count > 0}
							<text
								x={x + DAILY_BAR_W / 2}
								y={108 - bh - 5}
								text-anchor="middle"
								class="chart-val"
								fill={isToday ? '#2b9964' : '#9ca3af'}
							>{count}</text>
						{/if}
						<text x={x + DAILY_BAR_W / 2} y="128" text-anchor="middle" class="chart-day daily-label">{label}</text>
					{/each}
				</svg>
			</div>
		</section>
	</div>

	<!-- 5+6. Budget & scrapers côte à côte -->
	<div class="sections-row">
		<section class="section">
			<h2>Budget templates WhatsApp</h2>
			<div class="budget-list">
				{#each data.templateUsage as t}
					{@const pct = t.used / t.cap}
					{@const pctRounded = Math.round(pct * 100)}
					{@const color = typeColor(t.type, pct)}
					{@const isAlert = pct >= ALERT_THRESHOLD}
					<div class="budget-row {isAlert ? 'budget-alert-row' : ''}">
						<div class="budget-header">
							<span class="budget-type">{typeLabel[t.type] ?? t.type}</span>
							<span class="budget-ratio">{t.used} / {t.cap}</span>
						</div>
						<div class="progress-track">
							<div class="progress-fill" style="width: {pctRounded}%; background: {color}"></div>
						</div>
						<div class="budget-footer">
							<span class="budget-pct" style="color: {color}">{pctRounded}%</span>
							{#if isAlert}
								<span class="budget-warn">⚠ Dépasse 65% du plafond</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section class="section">
			<h2>État des scrapers</h2>
			<div class="scraper-list">
				{#each data.scrapers as s}
					<div class="scraper-row">
						<span class="dot" style="background: {statusDot[s.status]}"></span>
						<span class="scraper-name">{s.name}</span>
						{#if s.errorMessage}
							<span class="scraper-err">{s.errorMessage}</span>
						{/if}
						<span class="status-pill pill-{s.status}">{statusLabel[s.status]}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>

<style>
	.dashboard { max-width: 960px; }

	h1 { font-size: 1.5rem; font-weight: 700; color: var(--color-text); margin-bottom: 1.5rem; }

	h2 {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1rem;
	}

	.section {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.25rem;
	}

	/* ── Rangées côte à côte ───────────────────────────── */
	.sections-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.sections-row .section {
		margin-bottom: 0;
	}

	@media (max-width: 700px) {
		.sections-row { grid-template-columns: 1fr; }
	}

	/* ── Métriques ─────────────────────────────────────── */
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.metric-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.metric-card.metric-highlight {
		border-color: var(--color-yellow);
		background: var(--color-yellow-light);
	}

	.metric-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.metric-value {
		font-size: 2rem;
		font-weight: 700;
		color: #2b9964;
		line-height: 1;
	}

	.metric-value small {
		font-size: 1rem;
		color: var(--color-text-muted);
		font-weight: 400;
	}

	/* ── Couleurs métriques offres ─────────────────────── */
	.metric-card.metric-today {
		border-color: #2b9964;
		background: #f0faf5;
	}

	.metric-value--today { color: #2b9964; }
	.metric-value--pending { color: #d97706; }
	.metric-value--muted { color: var(--color-text-muted); font-size: 1.6rem; }

	/* ── Graphe TPQ ────────────────────────────────────── */
	.chart-wrap { max-width: 360px; }
	.chart-wrap--wide { max-width: 580px; }

	.tpq-chart { display: block; overflow: visible; }

	:global(.chart-day) {
		font-size: 10px;
		fill: #9ca3af;
		font-family: system-ui, sans-serif;
	}

	:global(.chart-val) {
		font-size: 9px;
		font-family: system-ui, sans-serif;
		font-weight: 600;
	}

	:global(.daily-label) {
		font-size: 8px;
	}

	.daily-chart { display: block; overflow: visible; }

	/* ── Budget templates ──────────────────────────────── */
	.budget-list { display: flex; flex-direction: column; gap: 1rem; }

	.budget-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
	}

	.budget-alert-row {
		background: var(--color-yellow-light);
		border: 1px solid var(--color-yellow);
	}

	.budget-header { display: flex; justify-content: space-between; align-items: center; }

	.budget-type { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.04em; color: var(--color-text); }
	.budget-ratio { font-size: 0.8rem; color: var(--color-text-muted); }

	.progress-track {
		height: 8px;
		background: var(--color-border);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.budget-footer { display: flex; align-items: center; gap: 0.75rem; }
	.budget-pct { font-size: 0.75rem; font-weight: 600; }
	.budget-warn { font-size: 0.75rem; color: var(--color-yellow-dark); }

	/* ── Scrapers ──────────────────────────────────────── */
	.scraper-list { display: flex; flex-direction: column; gap: 0.5rem; }

	.scraper-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		font-size: 0.875rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.scraper-name { flex: 1; font-weight: 500; }
	.scraper-err { font-size: 0.75rem; color: #991b1b; flex: 1; }

	.status-pill {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.pill-ok { background: var(--color-green-light); color: var(--color-green-dark); }
	.pill-warn { background: var(--color-yellow-light); color: var(--color-yellow-dark); }
	.pill-error { background: #fee2e2; color: #991b1b; }
</style>
