<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { isAdminAuthenticated, isEmployerAuthenticated } from '$lib/auth.js';

	if (browser) {
		if (isAdminAuthenticated()) {
			goto('/admin');
		} else if (isEmployerAuthenticated()) {
			goto('/employer');
		} else {
			goto('/employer');
		}
	}
</script>

<p>Redirection en cours…</p>
