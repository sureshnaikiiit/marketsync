import { NextResponse }
from 'next/server';

import { transporter }
from '@/lib/mail';

export async function GET() {

  try {

    const info =
      await transporter.sendMail({

        from:
          process.env.SMTP_USER,

        to: ['venudevops419@gmail.com','sureshnaikiiit@gmail.com'],

        subject: 'MarketSync mailer',

        text:
          'Hello, This is a test email from MarketSync!',
        html: `<h1>SMTP Server working!</h1>`
      });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });

  } catch (err) {

    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error',
      },
      {
        status: 500
      }
    );
  }
}