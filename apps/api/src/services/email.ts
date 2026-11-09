import { HttpError } from '../lib/errors.ts';
export function emailSender(config: {
    SMTP_HOST?: string;
    SMTP_PORT: number;
    SMTP_SECURE: boolean;
    SMTP_USER?: string;
    SMTP_PASSWORD?: string;
    SMTP_FROM?: string;
}) {
    const host = config.SMTP_HOST?.trim();
    const user = config.SMTP_USER?.trim();
    const from = config.SMTP_FROM?.trim();
    // Google displays App Passwords in space-separated groups.
    const password = host?.toLowerCase() === 'smtp.gmail.com'
        ? config.SMTP_PASSWORD?.replace(/\s/g, '') : config.SMTP_PASSWORD;
    let transport: {
        sendMail: (message: object) => Promise<unknown>;
    } | undefined;
    return async (email: string, code: string) => {
        if (!host || !from)
            throw new HttpError(503, 'Email delivery is not configured');
        if (user && !password)
            throw new HttpError(503, 'Email authentication is not configured');
        try {
            if (!transport) {
                const moduleName = 'nodemailer';
                const { default: nodemailer } = await import(moduleName);
                transport = nodemailer.createTransport({ host, port: config.SMTP_PORT, secure: config.SMTP_SECURE, requireTLS: !config.SMTP_SECURE, auth: user ? { user, pass: password } : undefined, logger: false, debug: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
            }
            await transport!.sendMail({ from, to: email, subject: 'Verify your Nursing & Medicine account', text: `Your verification code is ${code}. Enter it in the verification form to create your account.` });
        }
        catch (error) {
            const failure = error as { code?: string; responseCode?: number };
            const message = failure.code === 'EAUTH'
                ? 'Email authentication failed. The site owner needs to check the SMTP username and App Password.'
                : ['EDNS', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(failure.code ?? '')
                    ? 'The email server could not be reached securely. Please try again later.'
                    : failure.code === 'EENVELOPE'
                        ? 'The email server rejected the sender or recipient address.'
                        : 'Email could not be delivered. Please try again.';
            // Preserve only diagnostic codes; SMTP errors can contain addresses and message data.
            const safeCode = ['EAUTH', 'EDNS', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE', 'EMESSAGE', 'ERR_MODULE_NOT_FOUND'].includes(failure.code ?? '') ? failure.code : 'SMTP_FAILURE';
            throw Object.assign(new HttpError(503, message), { code: safeCode, responseCode: failure.responseCode });
        }
    };
}
