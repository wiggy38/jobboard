// @ts-nocheck
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { TemplateLog, TemplateUsage } from '$lib/types.js';

const now = new Date();
const h = (offset: number) => new Date(now.getTime() - offset * 3_600_000).toISOString();

const MOCK_LOGS: TemplateLog[] = [
	{ id: '1', phoneNumber: '+22670123456', type: 'RELANCE', sentAt: h(0.5), status: 'READ' },
	{ id: '2', phoneNumber: '+22671234567', type: 'MATCH_PARFAIT', sentAt: h(1.5), status: 'DELIVERED' },
	{ id: '3', phoneNumber: '+22672345678', type: 'NUDGE_PREMIUM', sentAt: h(3), status: 'SENT' },
	{ id: '4', phoneNumber: '+22673456789', type: 'RELANCE', sentAt: h(5), status: 'FAILED' },
	{ id: '5', phoneNumber: '+22674567890', type: 'MATCH_PARFAIT', sentAt: h(8), status: 'READ' },
	{ id: '6', phoneNumber: '+22675678901', type: 'NUDGE_PREMIUM', sentAt: h(24), status: 'DELIVERED' },
	{ id: '7', phoneNumber: '+22676789012', type: 'RELANCE', sentAt: h(26), status: 'READ' },
	{ id: '8', phoneNumber: '+22677890123', type: 'MATCH_PARFAIT', sentAt: h(28), status: 'DELIVERED' },
	{ id: '9', phoneNumber: '+22678901234', type: 'RELANCE', sentAt: h(48), status: 'SENT' },
	{ id: '10', phoneNumber: '+22679012345', type: 'NUDGE_PREMIUM', sentAt: h(50), status: 'READ' },
	{ id: '11', phoneNumber: '+22670234567', type: 'MATCH_PARFAIT', sentAt: h(72), status: 'FAILED' },
	{ id: '12', phoneNumber: '+22671345678', type: 'RELANCE', sentAt: h(74), status: 'DELIVERED' },
];

const MOCK_USAGE: TemplateUsage[] = [
	{ type: 'RELANCE', used: 45, cap: 100 },
	{ type: 'MATCH_PARFAIT', used: 68, cap: 100 },
	{ type: 'NUDGE_PREMIUM', used: 23, cap: 100 },
];

export const ssr = false;

export const load = async () => {
	try {
		const [logs, usage] = await Promise.all([
			adminApi.getTemplateLogs(),
			adminApi.getTemplateUsage(),
		]);
		return { logs, usage };
	} catch {
		if (!import.meta.env.DEV) throw new Error('API unavailable');
		return { logs: MOCK_LOGS, usage: MOCK_USAGE };
	}
};
;null as any as PageLoad;