const PAYDUNYA_BASE_URL = 'https://app.paydunya.com/api/v1'

function paydunyaHeaders() {
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY ?? '',
    'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY ?? '',
    'PAYDUNYA-PUBLIC-KEY': process.env.PAYDUNYA_PUBLIC_KEY ?? '',
    'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN ?? '',
  }
}

export interface CreateInvoiceParams {
  amount: number
  description: string
  customData: Record<string, string>
  returnUrl: string
  cancelUrl: string
  callbackUrl: string
}

export interface CreateInvoiceResult {
  token: string
  invoiceUrl: string
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const response = await fetch(`${PAYDUNYA_BASE_URL}/checkout-invoice/create`, {
    method: 'POST',
    headers: paydunyaHeaders(),
    body: JSON.stringify({
      invoice: {
        total_amount: params.amount,
        description: params.description,
      },
      store: {
        name: 'Tumaa',
      },
      actions: {
        cancel_url: params.cancelUrl,
        return_url: params.returnUrl,
        callback_url: params.callbackUrl,
      },
      custom_data: params.customData,
    }),
  })

  const data = (await response.json()) as {
    response_code?: string
    response_text?: string
    token?: string
  }

  if (data.response_code !== '00' || !data.token) {
    throw new Error(`PAYDUNYA_CREATE_INVOICE_FAILED: ${data.response_text ?? 'unknown error'}`)
  }

  return {
    token: data.token,
    invoiceUrl: `https://paydunya.com/checkout/invoice/${data.token}`,
  }
}

export type PaydunyaInvoiceStatus = 'completed' | 'pending' | 'cancelled'

export interface ConfirmInvoiceResult {
  status: PaydunyaInvoiceStatus
  customData: Record<string, string>
}

export async function confirmInvoice(token: string): Promise<ConfirmInvoiceResult> {
  const response = await fetch(`${PAYDUNYA_BASE_URL}/checkout-invoice/confirm/${token}`, {
    method: 'GET',
    headers: paydunyaHeaders(),
  })

  const data = (await response.json()) as {
    response_code?: string
    status?: string
    custom_data?: Record<string, string>
  }

  if (data.response_code !== '00' || !data.status) {
    throw new Error('PAYDUNYA_CONFIRM_INVOICE_FAILED')
  }

  return {
    status: data.status as PaydunyaInvoiceStatus,
    customData: data.custom_data ?? {},
  }
}
