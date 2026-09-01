<script lang="ts">
	let {
		value = $bindable(''),
		options,
		placeholder = '',
		required = false,
		disabled = false,
	}: {
		value?: string;
		options: { value: string; label: string }[];
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
	} = $props();

	const uid = `combobox-${Math.random().toString(36).slice(2)}`;

	let inputText = $state('');
	let open = $state(false);
	let highlightedIndex = $state(-1);
	let rootEl: HTMLDivElement;
	let inputEl: HTMLInputElement;

	function normalize(s: string): string {
		return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
	}

	function syncFromValue() {
		const match = options.find((o) => o.value === value);
		if (match) {
			inputText = match.label;
		} else if (value) {
			inputText = value;
		} else {
			inputText = '';
		}
	}

	$effect(() => {
		value;
		options;
		if (!open) syncFromValue();
	});

	let filteredOptions = $derived.by(() => {
		const q = normalize(inputText);
		if (!q) return options;
		const current = options.find((o) => o.value === value);
		if (current && normalize(current.label) === q) return options;
		return options.filter((o) => normalize(o.label).includes(q));
	});

	function openList() {
		if (disabled) return;
		open = true;
		highlightedIndex = filteredOptions.findIndex((o) => o.value === value);
	}

	function commit(option: { value: string; label: string }) {
		value = option.value;
		inputText = option.label;
		open = false;
		highlightedIndex = -1;
	}

	function reconcile() {
		const q = normalize(inputText);
		const exact = options.find((o) => normalize(o.label) === q);
		if (exact) {
			value = exact.value;
			inputText = exact.label;
		} else {
			syncFromValue();
		}
		open = false;
		highlightedIndex = -1;
	}

	function handleInput() {
		open = true;
		highlightedIndex = 0;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				openList();
				return;
			}
			highlightedIndex = Math.min(highlightedIndex + 1, filteredOptions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			if (open && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
				e.preventDefault();
				commit(filteredOptions[highlightedIndex]);
			}
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				reconcile();
			}
		}
	}

	function handleBlur() {
		queueMicrotask(() => {
			if (!rootEl.contains(document.activeElement)) reconcile();
		});
	}

	function handleDocumentPointerdown(e: PointerEvent) {
		if (open && rootEl && !rootEl.contains(e.target as Node)) reconcile();
	}

	$effect(() => {
		if (open) {
			document.addEventListener('pointerdown', handleDocumentPointerdown);
			return () => document.removeEventListener('pointerdown', handleDocumentPointerdown);
		}
	});
</script>

<div class="combobox" class:open bind:this={rootEl}>
	<input
		bind:this={inputEl}
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-autocomplete="list"
		aria-controls="{uid}-listbox"
		aria-activedescendant={open && highlightedIndex >= 0 ? `${uid}-option-${highlightedIndex}` : undefined}
		{placeholder}
		{required}
		{disabled}
		autocomplete="off"
		bind:value={inputText}
		onfocus={openList}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
	/>
	{#if open}
		<ul class="combobox-listbox" role="listbox" id="{uid}-listbox">
			{#if filteredOptions.length === 0}
				<li class="combobox-empty">Aucun résultat</li>
			{:else}
				{#each filteredOptions as option, i (option.value)}
					<li
						id="{uid}-option-{i}"
						role="option"
						aria-selected={option.value === value}
						class="combobox-option"
						class:highlighted={i === highlightedIndex}
						onmousedown={(e) => { e.preventDefault(); commit(option); }}
						onmouseenter={() => (highlightedIndex = i)}
					>
						{option.label}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.combobox {
		position: relative;
		width: 100%;
	}
	.combobox input {
		width: 100%;
		box-sizing: border-box;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 6px 10px;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		outline: none;
		transition: border-color 0.12s;
	}
	.combobox input:focus,
	.combobox.open input {
		border-color: #2b9964;
	}
	.combobox input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.combobox-listbox {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 30;
		max-height: 240px;
		overflow-y: auto;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		margin: 0;
		padding: 4px;
		list-style: none;
	}
	.combobox-option {
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		color: var(--color-text);
		cursor: pointer;
	}
	.combobox-option[aria-selected='true'] {
		font-weight: 600;
	}
	.combobox-option.highlighted {
		background: var(--color-bg-subtle);
	}
	.combobox-empty {
		padding: 0.5rem 0.6rem;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
</style>
