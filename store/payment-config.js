// PUBLIC PAYMENT INSTRUCTIONS. Edit these before launch; never put login credentials,
// PINs, OTPs, card details, API secrets, or private keys in this file.
// Enable a method only after filling in and checking the recipient details.
export const paymentMethods = {
  gcash: {
    label: 'GCash', enabled: false,
    recipient: '', // GCash recipient name
    account: '', // GCash number
    bank: '',
    // Payment note/instructions (public)
    instructions: 'Send the exact amount, then enter the transaction reference below.',
  },
  bank_transfer: {
    label: 'Bank Transfer', enabled: false,
    recipient: '', // Account name
    account: '', // Account number
    bank: '', // Bank name
    // Payment note/instructions (public)
    instructions: 'Transfer the exact amount, then enter the bank transaction reference below.',
  },
};
