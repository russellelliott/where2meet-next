import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { senderEmail, senderName, recipientEmail, mapId, mapName } = req.body;
  if (!senderEmail || !recipientEmail || !mapId || !mapName) {
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

  const baseUrl = process.env.CLIENT_BASE_URL || 'http://localhost:3000';
  const senderMailOptions = {
    from: process.env.EMAIL_FROM,
    to: senderEmail,
    subject: `You invited ${recipientEmail} to collaborate on ${mapName}`,
    text: `You have invited ${recipientEmail} to collaborate on your map "${mapName}".`
  };
  const recipientMailOptions = {
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: `${senderName} invited you to collaborate on a map!`,
    html: `<p>${senderName} has invited you to collaborate on the map <strong>${mapName}</strong>.<br><br>
      Click the link below to view the map. You'll be able to accept or decline the invitation on the map page:<br>
      <a href="${baseUrl}/map/${mapId}">${baseUrl}/map/${mapId}</a></p>`
  };

  try {
    await transporter.sendMail(senderMailOptions);
    await transporter.sendMail(recipientMailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending invite emails:', error);
    res.status(500).json({ error: 'Failed to send invite emails' });
  }
}