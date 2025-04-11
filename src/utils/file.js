import { logInfo, logError } from './logging.js';

// Helper function to determine file type based on extension
export function getFileType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'js': 'application/javascript',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

// Helper function to handle file attachments
export async function attachmentHandler({message, logger}) {
  // Check for file attachments
  let attachments = [];
  if (!message.files || message.files.length === 0) {
    return attachments;
  }

  logInfo(logger, `Message has ${message.files.length} attachments`);

  // Process each file (limit to first file for simplicity)
  const file = message.files[0];

  try {
    // Download the file content
    const fileResponse = await fetch(file.url_private, {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      }
    });

    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    // Get file as buffer
    const fileBuffer = await fileResponse.arrayBuffer();

    // Convert to base64
    const base64File = Buffer.from(fileBuffer).toString('base64');

    // Add to attachments
    attachments.push({
      name: file.name,
      data: base64File,
      mediaType: file.mimetype || getFileType(file.name)
    });

    logInfo(logger, `Successfully processed file: ${file.name}`);
  } catch (fileError) {
    logError(logger, fileError, 'Error processing file attachment');
  }

  return attachments;
}
