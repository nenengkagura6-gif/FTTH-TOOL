// ==================================================
// Midtrans Payment Integration
// Snap API for subscription payments
// ==================================================

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || ''
const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''
const IS_PRODUCTION = process.env.MIDTRANS_PRODUCTION === 'true'

const BASE_URL = IS_PRODUCTION
    ? 'https://app.midtrans.com/snap/v1'
    : 'https://app.sandbox.midtrans.com/snap/v1'

export interface MidtransTransaction {
    orderId: string
    amount: number
    customerName: string
    customerEmail: string
    itemName: string
    itemId: string
}

/**
 * Create a Midtrans Snap transaction token
 */
export async function createSnapTransaction(tx: MidtransTransaction): Promise<{
    token: string | null
    redirectUrl: string | null
    error: string | null
}> {
    if (!MIDTRANS_SERVER_KEY) {
        return { 
            token: null, 
            redirectUrl: null, 
            error: "Kunci API Midtrans (MIDTRANS_SERVER_KEY) belum dikonfigurasi di file .env.local" 
        }
    }

    try {
        const authString = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64')

        const response = await fetch(`${BASE_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authString}`,
            },
            body: JSON.stringify({
                transaction_details: {
                    order_id: tx.orderId,
                    gross_amount: tx.amount,
                },
                item_details: [{
                    id: tx.itemId,
                    name: tx.itemName,
                    price: tx.amount,
                    quantity: 1,
                }],
                customer_details: {
                    first_name: tx.customerName,
                    email: tx.customerEmail,
                },
                callbacks: {
                    finish: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
                    error: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=error`,
                    pending: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=pending`,
                },
            }),
        })

        const data = await response.json()

        if (data.token) {
            return { token: data.token, redirectUrl: data.redirect_url, error: null }
        }

        return { token: null, redirectUrl: null, error: data.error_messages?.[0] || 'Failed to create transaction' }
    } catch (error) {
        return { token: null, redirectUrl: null, error: String(error) }
    }
}

/**
 * Verify Midtrans notification signature
 */
export function verifySignature(orderId: string, statusCode: string, grossAmount: string, signatureKey: string): boolean {
    // SHA512(order_id + status_code + gross_amount + server_key)
    const crypto = require('crypto')
    const payload = `${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`
    const hash = crypto.createHash('sha512').update(payload).digest('hex')
    return hash === signatureKey
}

export { MIDTRANS_CLIENT_KEY, IS_PRODUCTION }
