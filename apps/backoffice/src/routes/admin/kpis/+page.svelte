<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let country = $state(data.filters.country ?? '');

	function buildParams() {
		const p = new URLSearchParams();
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		if (country) p.set('country', country);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/kpis?${buildParams()}`);
	}

	function resetFilters() {
		const now = new Date();
		const past = new Date();
		past.setDate(past.getDate() - 30);
		from = past.toISOString().split('T')[0];
		to = now.toISOString().split('T')[0];
		country = '';
		goto(`/admin/kpis?from=${from}&to=${to}`);
	}

	const hasFilters = $derived(country !== '');

	type Point = { date: string; count: number };

	// KPI "cartes" (sparkline individuelle) — le funnel Inscription → Profil
	// complété → Conversion Premium est comparé dans l'histogramme groupé
	// ci-dessous à la place de trois cartes séparées.
	const cards: { key: keyof typeof data.series; label: string }[] = [
		{ key: 'offersViewed', label: 'Offres consultées' },
		{ key: 'lockedClicks', label: 'Clics offre verrouillée' },
		{ key: "shares", label: "Partages d'offre" },
		{ key: 'referralClicks', label: 'Clics sur lien partagé' },
		{ key: 'referralSignups', label: 'Inscriptions par parrainage' },
	];

	// Seuils K-factor validés métier — voir CLAUDE.md / discussion virale.
	const kFactorTier = $derived.by(() => {
		const v = data.kFactor.value;
		if (v === null) return { label: 'Pas assez de données', className: 'kf-none' };
		if (v >= 1) return { label: 'Boucle auto-entretenue', className: 'kf-loop' };
		if (v >= 0.8) return { label: 'Très intéressant', className: 'kf-high' };
		if (v >= 0.5) return { label: 'Intéressant', className: 'kf-mid' };
		if (v >= 0.3) return { label: 'Correct', className: 'kf-low' };
		return { label: 'Faible', className: 'kf-veryLow' };
	});

	// Palette catégorielle — 3 premiers slots de la palette de référence
	// (seuls ceux-ci passent la validation all-pairs, cf. skill dataviz),
	// dans l'ordre du funnel.
	const FUNNEL_SERIES: { key: keyof typeof data.series; label: string; color: string }[] = [
		{ key: 'signups', label: 'Inscriptions', color: '#2a78d6' },
		{ key: 'profileCompleted', label: 'Profils complétés', color: '#eb6834' },
		{ key: 'premiumConversions', label: 'Conversions Premium', color: '#1baf7a' },
	];

	// Sparkline SVG : une série de dates éparses (jours sans événement absents
	// côté API) est densifiée sur la période complète pour un tracé continu.
	function densify(series: Point[], from: string, to: string): Point[] {
		const byDate = new Map(series.map((p) => [p.date, p.count]));
		const out: Point[] = [];
		const cur = new Date(from);
		const end = new Date(to);
		while (cur <= end) {
			const iso = cur.toISOString().slice(0, 10);
			out.push({ date: iso, count: byDate.get(iso) ?? 0 });
			cur.setDate(cur.getDate() + 1);
		}
		return out;
	}

	const W = 280;
	const H = 56;
	const PAD = 4;

	function sparkPath(points: Point[]): { line: string; area: string; max: number } {
		const max = Math.max(1, ...points.map((p) => p.count));
		const n = points.length;
		const stepX = n > 1 ? (W - PAD * 2) / (n - 1) : 0;
		const coords = points.map((p, i) => {
			const x = PAD + i * stepX;
			const y = PAD + (1 - p.count / max) * (H - PAD * 2);
			return [x, y];
		});
		const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
		const area = `${line} L${coords[coords.length - 1]?.[0].toFixed(1) ?? PAD},${H - PAD} L${PAD},${H - PAD} Z`;
		return { line, area, max };
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
	}

	let openDetail = $state<string | null>(null);
	function toggleDetail(key: string) {
		openDetail = openDetail === key ? null : key;
	}

	// ── Histogramme comparatif (Inscriptions / Profils complétés / Conversions) ──
	const BAR_W = 640;
	const BAR_H = 200;
	const BAR_PAD_TOP = 8;
	const BAR_PAD_BOTTOM = 22; // place pour les repères de date
	const GROUP_GAP = 3;
	const BAR_GAP = 1.5;

	type FunnelGroup = {
		date: string;
		bars: { key: string; label: string; color: string; count: number; x: number; y: number; w: number; h: number }[];
		groupX: number;
		groupW: number;
	};

	const funnelPoints = $derived(
		FUNNEL_SERIES.map((s) => ({ ...s, points: densify(data.series[s.key] as Point[], data.filters.from, data.filters.to) }))
	);

	const funnelGroups = $derived.by((): FunnelGroup[] => {
		const days = funnelPoints[0]?.points.map((p) => p.date) ?? [];
		const maxVal = Math.max(1, ...funnelPoints.flatMap((s) => s.points.map((p) => p.count)));
		const plotH = BAR_H - BAR_PAD_TOP - BAR_PAD_BOTTOM;
		const n = days.length || 1;
		const groupW = (BAR_W - GROUP_GAP * (n - 1)) / n;
		const barW = (groupW - BAR_GAP * (FUNNEL_SERIES.length - 1)) / FUNNEL_SERIES.length;

		return days.map((date, i) => {
			const groupX = i * (groupW + GROUP_GAP);
			const bars = FUNNEL_SERIES.map((s, si) => {
				const count = funnelPoints[si].points[i]?.count ?? 0;
				const h = (count / maxVal) * plotH;
				return {
					key: s.key as string,
					label: s.label,
					color: s.color,
					count,
					x: groupX + si * (barW + BAR_GAP),
					y: BAR_PAD_TOP + (plotH - h),
					w: Math.max(0, barW),
					h: Math.max(0, h),
				};
			});
			return { date, bars, groupX, groupW };
		});
	});

	let hoveredGroup = $state<FunnelGroup | null>(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	function onGroupHover(e: PointerEvent, group: FunnelGroup) {
		const target = e.currentTarget as SVGElement;
		const rect = target.ownerSVGElement!.getBoundingClientRect();
		tooltipPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		hoveredGroup = group;
	}

	function onGroupLeave() {
		hoveredGroup = null;
	}

	let funnelDetailOpen = $state(false);
</script>

<div class="page">
	<div class="page-header">
		<h1>KPI journaliers</h1>
	</div>

	{#if data.error}
		<div class="api-error">⚠ API error : <code>{data.error}</code></div>
	{/if}

	<div class="filters">
		<div class="filter-row">
			<label class="filter-field">
				<span>Du</span>
				<input type="date" bind:value={from} />
			</label>

			<label class="filter-field">
				<span>Au</span>
				<input type="date" bind:value={to} />
			</label>

			<label class="filter-field">
				<span>Pays</span>
				<select bind:value={country}>
					<option value="">Tous</option>
					<option value="BF">Burkina Faso</option>
					<option value="BJ">Bénin</option>
					<option value="TG">Togo</option>
					<option value="CI">Côte d'Ivoire</option>
				</select>
			</label>
		</div>

		<div class="filter-actions">
			<button class="btn-apply" onclick={applyFilters}>Filtrer</button>
			{#if hasFilters}
				<button class="btn-reset" onclick={resetFilters}>Réinitialiser</button>
			{/if}
		</div>
	</div>

	<div class="kfactor-card">
		<div class="kfactor-main">
			<span class="kfactor-label">K-factor</span>
			<span class="kfactor-value">{data.kFactor.value !== null ? data.kFactor.value.toFixed(2) : '—'}</span>
			<span class="kfactor-badge {kFactorTier.className}">{kFactorTier.label}</span>
		</div>
		<p class="kfactor-detail">
			{#if data.kFactor.value !== null}
				{data.kFactor.referralSignups} inscription{data.kFactor.referralSignups > 1 ? 's' : ''} par
				parrainage sur la période ÷ {data.kFactor.existingUsersAtPeriodStart} utilisateur{data.kFactor.existingUsersAtPeriodStart > 1 ? 's' : ''}
				existant{data.kFactor.existingUsersAtPeriodStart > 1 ? 's' : ''} en début de période.
			{:else}
				Aucun utilisateur existant en début de période — pas assez d'historique pour calculer le K-factor.
			{/if}
		</p>
		<p class="kfactor-detail">
			{#if data.kFactor.clickToSignupRate !== null}
				{data.kFactor.referralSignups} inscription{data.kFactor.referralSignups > 1 ? 's' : ''} ÷
				{data.kFactor.referralClicks} clic{data.kFactor.referralClicks > 1 ? 's' : ''} sur lien partagé =
				{(data.kFactor.clickToSignupRate * 100).toFixed(1)}% de conversion clic → inscription.
			{:else}
				Aucun clic sur un lien partagé sur la période — pas de taux de conversion calculable.
			{/if}
		</p>
	</div>

	<div class="funnel-card">
		<div class="funnel-header">
			<h2>Funnel d'activation</h2>
			<ul class="legend">
				{#each FUNNEL_SERIES as s}
					<li>
						<span class="legend-swatch" style="background:{s.color}"></span>
						{s.label}
						<strong>{data.totals[s.key]}</strong>
					</li>
				{/each}
			</ul>
		</div>

		<div class="funnel-chart-wrap">
			<svg
				class="funnel-chart"
				viewBox="0 0 {BAR_W} {BAR_H}"
				role="img"
				aria-label="Comparaison journalière Inscriptions / Profils complétés / Conversions Premium du {data.filters.from} au {data.filters.to}"
			>
				<line x1="0" y1={BAR_H - BAR_PAD_BOTTOM} x2={BAR_W} y2={BAR_H - BAR_PAD_BOTTOM} class="baseline" />
				{#each funnelGroups as group, i}
					{#each group.bars as bar}
						<rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx="1.5" fill={bar.color} class="funnel-bar" />
					{/each}
					{#if i === 0 || i === funnelGroups.length - 1 || i % 7 === 0}
						<text x={group.groupX + group.groupW / 2} y={BAR_H - 8} class="axis-label" text-anchor="middle">
							{formatDate(group.date)}
						</text>
					{/if}
					<rect
						x={group.groupX - GROUP_GAP / 2}
						y="0"
						width={group.groupW + GROUP_GAP}
						height={BAR_H - BAR_PAD_BOTTOM}
						class="hit-col"
						class:hit-col-active={hoveredGroup?.date === group.date}
						role="img"
						aria-label="{formatDate(group.date)} : {group.bars.map((b) => `${b.label} ${b.count}`).join(', ')}"
						onpointerenter={(e) => onGroupHover(e, group)}
						onpointerleave={onGroupLeave}
					/>
				{/each}
			</svg>

			{#if hoveredGroup}
				<div class="tooltip" style="left:{tooltipPos.x}px; top:{tooltipPos.y}px">
					<div class="tooltip-date">{formatDate(hoveredGroup.date)}</div>
					{#each hoveredGroup.bars as bar}
						<div class="tooltip-row">
							<span class="tooltip-key" style="background:{bar.color}"></span>
							<span class="tooltip-value">{bar.count}</span>
							<span class="tooltip-label">{bar.label}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<button type="button" class="btn-detail" onclick={() => (funnelDetailOpen = !funnelDetailOpen)}>
			{funnelDetailOpen ? 'Masquer le détail' : 'Voir le détail'}
		</button>

		{#if funnelDetailOpen}
			<table class="detail-table">
				<thead>
					<tr>
						<th>Date</th>
						{#each FUNNEL_SERIES as s}<th>{s.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each [...funnelGroups].reverse() as group}
						<tr>
							<td>{formatDate(group.date)}</td>
							{#each group.bars as bar}<td>{bar.count}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<div class="kpi-grid">
		{#each cards as card}
			{@const rawSeries = data.series[card.key] as Point[]}
			{@const points = densify(rawSeries, data.filters.from, data.filters.to)}
			{@const spark = sparkPath(points)}
			{@const total = data.totals[card.key]}
			<div class="kpi-card">
				<div class="kpi-header">
					<span class="kpi-label">{card.label}</span>
					<span class="kpi-value">{total}</span>
				</div>

				<svg
					class="sparkline"
					viewBox="0 0 {W} {H}"
					role="img"
					aria-label="Évolution de {card.label} du {data.filters.from} au {data.filters.to}, total {total}"
				>
					<path d={spark.area} class="spark-area" />
					<path d={spark.line} class="spark-line" />
				</svg>

				<button type="button" class="btn-detail" onclick={() => toggleDetail(card.key)}>
					{openDetail === card.key ? 'Masquer le détail' : 'Voir le détail'}
				</button>

				{#if openDetail === card.key}
					<table class="detail-table">
						<thead>
							<tr><th>Date</th><th>Nombre</th></tr>
						</thead>
						<tbody>
							{#each [...points].reverse() as p}
								<tr><td>{formatDate(p.date)}</td><td>{p.count}</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.page { max-width: 1200px; }

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}
	.page-header h1 { margin-bottom: 0; }

	.filters {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1 1 150px;
		min-width: 130px;
	}

	.filter-field span {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.filter-field select,
	.filter-field input {
		height: 2.1rem;
		padding: 0 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-field select:focus,
	.filter-field input:focus {
		border-color: var(--color-green-mid);
	}

	.filter-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.btn-apply {
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.45rem 1.1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.1s;
	}
	.btn-apply:hover { opacity: 0.88; }
	.btn-apply:active { transform: scale(0.93); opacity: 0.75; }

	.btn-reset {
		background: var(--color-bg-subtle);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-reset:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

	.kfactor-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.1rem 1.25rem;
		margin-bottom: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.kfactor-main {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.kfactor-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.kfactor-value {
		font-size: 1.8rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}

	.kfactor-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-md);
	}

	.kfactor-badge.kf-none { background: var(--color-bg-subtle); color: var(--color-text-muted); }
	.kfactor-badge.kf-veryLow { background: var(--color-bg-subtle); color: var(--color-text-muted); }
	.kfactor-badge.kf-low { background: #fef3c7; color: #92400e; }
	.kfactor-badge.kf-mid { background: #dbeafe; color: #1e40af; }
	.kfactor-badge.kf-high { background: var(--color-green-light, #d1f5e3); color: var(--color-green-mid, #2b9964); }
	.kfactor-badge.kf-loop { background: var(--color-green, #2b9964); color: #fff; }

	.kfactor-detail {
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	.funnel-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.1rem 1.25rem;
		margin-bottom: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.funnel-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.funnel-header h2 {
		font-size: 0.95rem;
		font-weight: 700;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		list-style: none;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.legend strong {
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.legend-swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
	}

	.funnel-chart-wrap {
		position: relative;
	}

	.funnel-chart {
		width: 100%;
		height: 220px;
		display: block;
		overflow: visible;
	}

	.funnel-bar {
		transition: opacity 0.1s;
	}

	.baseline {
		stroke: var(--color-border);
		stroke-width: 1;
	}

	.axis-label {
		font-size: 6.5px;
		fill: var(--color-text-subtle);
	}

	.hit-col {
		fill: transparent;
		cursor: pointer;
	}

	.hit-col-active {
		fill: rgba(0, 0, 0, 0.035);
	}

	.tooltip {
		position: absolute;
		transform: translate(-50%, -100%) translateY(-8px);
		background: var(--color-text);
		color: #fff;
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.65rem;
		font-size: 0.75rem;
		pointer-events: none;
		white-space: nowrap;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
		z-index: 10;
	}

	.tooltip-date {
		font-weight: 700;
		margin-bottom: 0.3rem;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.tooltip-key {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		display: inline-block;
		flex-shrink: 0;
	}

	.tooltip-value {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.tooltip-label {
		color: #d1d5db;
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.9rem;
	}

	.kpi-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.kpi-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.kpi-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.kpi-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #2b9964;
		line-height: 1;
	}

	.sparkline {
		width: 100%;
		height: 56px;
		display: block;
	}

	.spark-line {
		fill: none;
		stroke: var(--color-green, #2b9964);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.spark-area {
		fill: var(--color-green-light, #d1f5e3);
		opacity: 0.5;
		stroke: none;
	}

	.btn-detail {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		font-size: 0.78rem;
		color: var(--color-green-mid, #2b9964);
		cursor: pointer;
		text-decoration: underline;
	}

	.detail-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
		max-height: 220px;
		overflow-y: auto;
		display: block;
	}

	.detail-table thead, .detail-table tbody { display: table; width: 100%; table-layout: fixed; }

	.detail-table th, .detail-table td {
		padding: 0.3rem 0.5rem;
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.detail-table th {
		color: var(--color-text-muted);
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.68rem;
	}

	.api-error {
		background: #fef9c3;
		color: #854d0e;
		border: 1px solid #fde047;
		padding: 0.6rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	.api-error code {
		font-family: monospace;
		font-size: 0.75rem;
	}
</style>
