<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import Underline from '@tiptap/extension-underline';

	let {
		value = $bindable(''),
		placeholder = '',
	}: {
		value?: string;
		placeholder?: string;
	} = $props();

	let editorEl: HTMLDivElement;
	let editor = $state<Editor | undefined>(undefined);
	let tick = $state(0); // incremented on each transaction to force toolbar re-render
	let skipEffect = false;

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [
				StarterKit,
				Underline,
				Placeholder.configure({ placeholder }),
			],
			content: value || '',
			onUpdate({ editor: e }) {
				skipEffect = true;
				value = e.getHTML() === '<p></p>' ? '' : e.getHTML();
				skipEffect = false;
			},
			onTransaction() {
				tick++;
			},
		});
	});

	onDestroy(() => {
		editor?.destroy();
	});

	// Sync external value changes (e.g. form reset) into the editor
	$effect(() => {
		const v = value;
		if (editor && !skipEffect) {
			const current = editor.getHTML() === '<p></p>' ? '' : editor.getHTML();
			if (v !== current) {
				editor.commands.setContent(v || '', { emitUpdate: false });
			}
		}
	});

	function cmd(fn: () => void) {
		return (e: MouseEvent) => {
			e.preventDefault();
			fn();
			editor?.view.focus();
		};
	}

	// Toolbar actions — reading isActive() inside derived expressions keyed on tick
	function active(name: string, attrs?: Record<string, unknown>) {
		void tick; // reactive dependency
		return editor?.isActive(name, attrs) ?? false;
	}
</script>

<div class="rich-editor">
	<!-- Toolbar -->
	<div class="toolbar" role="toolbar" aria-label="Formatage de texte">
		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('bold')}
			title="Gras (Ctrl+B)"
			onclick={cmd(() => editor?.chain().focus().toggleBold().run())}
		><strong>G</strong></button>

		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('italic')}
			title="Italique (Ctrl+I)"
			onclick={cmd(() => editor?.chain().focus().toggleItalic().run())}
		><em>I</em></button>

		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('strike')}
			title="Barré"
			onclick={cmd(() => editor?.chain().focus().toggleStrike().run())}
		><s>S</s></button>

		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('underline')}
			title="Souligné (Ctrl+U)"
			onclick={cmd(() => editor?.chain().focus().toggleUnderline().run())}
		><u>U</u></button>

		<div class="tb-sep"></div>

		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('bulletList')}
			title="Liste à puces"
			onclick={cmd(() => editor?.chain().focus().toggleBulletList().run())}
		>• Liste</button>

		<button
			type="button"
			class="tb-btn"
			class:tb-active={active('orderedList')}
			title="Liste numérotée"
			onclick={cmd(() => editor?.chain().focus().toggleOrderedList().run())}
		>1. Liste</button>

		<div class="tb-sep"></div>

		<button
			type="button"
			class="tb-btn"
			title="Annuler (Ctrl+Z)"
			onclick={cmd(() => editor?.chain().focus().undo().run())}
			disabled={!editor?.can().undo()}
		>↩</button>

		<button
			type="button"
			class="tb-btn"
			title="Rétablir (Ctrl+Y)"
			onclick={cmd(() => editor?.chain().focus().redo().run())}
			disabled={!editor?.can().redo()}
		>↪</button>
	</div>

	<!-- Editor surface -->
	<div bind:this={editorEl} class="editor-surface"></div>
</div>

<style>
	.rich-editor {
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		transition: border-color 0.12s;
	}
	.rich-editor:focus-within {
		border-color: #2b9964;
	}

	/* ── Toolbar ─────────────────────────────────────────── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 5px 8px;
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.tb-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: background 0.1s, color 0.1s, border-color 0.1s;
		line-height: 1.4;
		font-family: inherit;
	}
	.tb-btn:hover:not(:disabled) {
		background: var(--color-border);
		color: var(--color-text);
	}
	.tb-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.tb-active {
		background: #2b996420 !important;
		border-color: #2b996440 !important;
		color: #2b9964 !important;
	}

	.tb-sep {
		width: 1px;
		height: 18px;
		background: var(--color-border);
		margin: 0 4px;
	}

	/* ── Editor surface ──────────────────────────────────── */
	.editor-surface {
		padding: 8px 10px;
		min-height: 110px;
		font-size: 0.875rem;
		line-height: 1.65;
		color: var(--color-text);
		cursor: text;
	}

	/* Tiptap injects a div.tiptap inside our bound element */
	.editor-surface :global(.tiptap) {
		outline: none;
		min-height: 90px;
	}

	.editor-surface :global(p) { margin: 0 0 0.4em; }
	.editor-surface :global(p:last-child) { margin-bottom: 0; }

	.editor-surface :global(ul),
	.editor-surface :global(ol) {
		padding-left: 1.4em;
		margin: 0.3em 0 0.5em;
	}
	.editor-surface :global(li) { margin-bottom: 0.2em; }

	.editor-surface :global(strong) { font-weight: 700; }
	.editor-surface :global(em) { font-style: italic; }
	.editor-surface :global(s) { text-decoration: line-through; }
	.editor-surface :global(u) { text-decoration: underline; }

	/* Placeholder */
	.editor-surface :global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--color-text-muted);
		pointer-events: none;
		float: left;
		height: 0;
		font-style: italic;
		opacity: 0.6;
	}
</style>
