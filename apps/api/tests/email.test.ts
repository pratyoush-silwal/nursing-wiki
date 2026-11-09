import test from 'node:test';
import assert from 'node:assert/strict';
import { emailSender } from '../src/services/email.ts';
const moduleName = 'nodemailer';
const { default: nodemailer } = await import(moduleName);
const config = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: 'sender@example.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop', SMTP_FROM: 'sender@example.com' };

test('Gmail delivery removes App Password display spaces and retains the intended recipient', async t => {
    let options: any, message: any;
    t.mock.method(nodemailer, 'createTransport', (value: unknown) => {
        options = value;
        return { sendMail: async (value: unknown) => { message = value; } };
    });
    await emailSender(config)('reader@example.com', '123456');
    assert.equal(options.auth.pass, 'abcdefghijklmnop');
    assert.equal(options.secure, true);
    assert.equal(message.to, 'reader@example.com');
    assert.match(message.text, /123456/);
});

test('non-Gmail SMTP passwords retain significant whitespace', async t => {
    let password: string | undefined;
    t.mock.method(nodemailer, 'createTransport', (options: any) => {
        password = options.auth.pass;
        return { sendMail: async () => {} };
    });
    await emailSender({ ...config, SMTP_HOST: 'smtp.example.com' })('reader@example.com', '123456');
    assert.equal(password, config.SMTP_PASSWORD);
});

test('delivery errors distinguish authentication and network failures without leaking SMTP details', async t => {
    for (const [code, expected] of [['EAUTH', /authentication failed/], ['EDNS', /could not be reached/], ['EENVELOPE', /rejected/]]) {
        const mock = t.mock.method(nodemailer, 'createTransport', () => ({
            sendMail: async () => { throw Object.assign(new Error('secret provider response'), { code, responseCode: 535 }); }
        }));
        await assert.rejects(emailSender(config)('reader@example.com', '123456'), (error: any) => {
            assert.equal(error.statusCode, 503);
            assert.equal(error.code, code);
            assert.match(error.message, expected as RegExp);
            assert.ok(!JSON.stringify(error).includes('secret provider response'));
            return true;
        });
        mock.mock.restore();
    }
});
