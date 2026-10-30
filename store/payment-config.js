// PUBLIC PAYMENT INSTRUCTIONS. Edit these before launch; never put login credentials,
// PINs, OTPs, card details, API secrets, or private keys in this file.
// Enable a method only after filling in and checking the recipient details.
export const paymentMethods = {
  gcash: {
    enabled: true,
    recipient: 'Ma. Bernadette L Finuliar',  
    account: '09062305755',  
    bank: '',
    // Payment note/instructions (public)
    instructions: 'Send the exact amount, then enter the transaction reference below.',
  },
  bank_transfer: {
    enabled: true,
    recipient: 'MA. BERNADETTE L FINULIAR',  
    account: '4719385678',  
    bank: 'BPI',  
    // Payment note/instructions (public)
    instructions: 'Transfer the exact amount, then enter the bank transaction reference below.',
  },
};
