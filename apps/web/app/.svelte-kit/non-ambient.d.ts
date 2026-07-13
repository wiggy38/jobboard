
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/offres" | "/admin/offres/[id]" | "/admin/scouts" | "/admin/scouts/[id]" | "/admin/scrapers" | "/admin/templates" | "/auth" | "/auth/login" | "/employer" | "/employer/offres" | "/employer/publier" | "/login" | "/offre" | "/offre/[token]" | "/offre/[token]/__tests__";
		RouteParams(): {
			"/admin/offres/[id]": { id: string };
			"/admin/scouts/[id]": { id: string };
			"/offre/[token]": { token: string };
			"/offre/[token]/__tests__": { token: string }
		};
		LayoutParams(): {
			"/": { id?: string | undefined; token?: string | undefined };
			"/admin": { id?: string | undefined };
			"/admin/offres": { id?: string | undefined };
			"/admin/offres/[id]": { id: string };
			"/admin/scouts": { id?: string | undefined };
			"/admin/scouts/[id]": { id: string };
			"/admin/scrapers": Record<string, never>;
			"/admin/templates": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/login": Record<string, never>;
			"/employer": Record<string, never>;
			"/employer/offres": Record<string, never>;
			"/employer/publier": Record<string, never>;
			"/login": Record<string, never>;
			"/offre": { token?: string | undefined };
			"/offre/[token]": { token: string };
			"/offre/[token]/__tests__": { token: string }
		};
		Pathname(): "/" | "/admin" | "/admin/offres" | `/admin/offres/${string}` & {} | "/admin/scouts" | `/admin/scouts/${string}` & {} | "/admin/scrapers" | "/admin/templates" | "/auth/login" | "/employer" | "/employer/offres" | "/employer/publier" | "/login" | `/offre/${string}` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/logo.png" | string & {};
	}
}