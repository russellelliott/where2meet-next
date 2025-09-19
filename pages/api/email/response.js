import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { senderEmail, senderName, ownerEmail, mapName, response } = req.body;
  if (!senderEmail || !ownerEmail || !mapName || !response) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  const responderMailOptions = {
    from: process.env.EMAIL_FROM,
    to: senderEmail,
    subject: `You ${response} the invitation to ${mapName}`,
    text: `You have ${response} the invitation to collaborate on the map "${mapName}".`
  };

  const ownerMailOptions = {
    from: process.env.EMAIL_FROM,
    to: ownerEmail,
    subject: `${senderName} ${response} your map invitation`,
    text: `${senderName} has ${response} your invitation to collaborate on the map "${mapName}".`
  };

  try {
    await transporter.sendMail(responderMailOptions);
    await transporter.sendMail(ownerMailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending response emails:', error);
    res.status(500).json({ error: 'Failed to send response emails' });
  }
}