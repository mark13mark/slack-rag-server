import { logInfo, logError } from '../utils/logging.js';
import {
  getDataSource,
  syncDataSource,
  getKnowledgeBaseStatus,
  getDataSourceConfig,
  getAgentStatus,
  listDataSources,
  getIngestionJobStatus
} from '../services/bedrock.js';

// Handle /ragbot-get-datasource command
export async function handleGetDataSource({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-get-datasource command`);

    const response = await getDataSource();
    await respond({
      text: response
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-get-datasource');
    await respond({
      text: `Error getting data source information: ${error}`
    });
  }
}

// Handle /ragbot-sync-datasource command
export async function handleSyncDataSource({ command, ack, respond, client, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-sync-datasource command from user ${command.user_id}`);

    // Check if user has the required role
    // const hasRequiredRole = await checkUserRole({
    //   client,
    //   userId: command.user_id,
    //   requiredRole: 'aws-bot-maintainer'
    // });

    // if (!hasRequiredRole) {
    //   await respond({
    //     text: 'Sorry, you do not have permission to use this command. Only users with the aws-bot-maintainer role can sync the data source.'
    //   });
    //   return;
    // }

    const response = await syncDataSource();
    await respond({
      text: response
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-sync-datasource');
    await respond({
      text: `Error syncing data source: ${error}`
    });
  }
}

// Handle /ragbot-help command
export async function handleHelp({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-help command`);

    const helpText = `Available commands:
    /ragbot-help - Show this help message
    /ragbot-kb-status - Check the status of the knowledge base
    /ragbot-sync-datasource - Trigger a sync of the knowledge base
    /ragbot-list-datasources - List all available data sources
    /ragbot-ds-config - Get configuration for the data source
    /ragbot-get-datasource - Get information about the current data source
    /ragbot-agent-status - Check the status of the agent
    /ragbot-job-status <job_id> - Check the status of an ingestion job`;

    await respond({
      text: helpText
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-help');
    await respond({
      text: `Error displaying help: ${error}`
    });
  }
}

// Handle /ragbot-kb-status command
export async function handleKbStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-kb-status command`);

    const response  = await getKnowledgeBaseStatus();
    await respond({
      text: `Knowledge Base Status:\n${response}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-kb-status');
    await respond({
      text: `Error getting knowledge base status: ${error}`
    });
  }
}

// Handle /ragbot-ds-config command
export async function handleDsConfig({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-ds-config command`);

    const response = await getDataSourceConfig();
    await respond({
      text: `Data Source Configuration:\n${response}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-ds-config');
    await respond({
      text: `Error getting data source configuration: ${error}`
    });
  }
}

// Handle /ragbot-agent-status command
export async function handleAgentStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-agent-status command`);

    const response = await getAgentStatus();
    await respond({
      text: `Agent Status:\n${response}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-agent-status');
    await respond({
      text: `Error getting agent status: ${error}`
    });
  }
}

// Handle /ragbot-list-datasources command
export async function handleListDataSources({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-list-datasources command`);

    const response = await listDataSources();
    await respond({
      text: `Available Data Sources:\n${response}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-list-datasources');
    await respond({
      text: `Error listing data sources: ${error}`
    });
  }
}

// Handle /ragbot-job-status command
export async function handleJobStatus({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-job-status command`);

    const jobId = command.text.trim();
    if (!jobId) {
      await respond({
        text: 'Please provide a job ID. Usage: /ragbot-job-status <job_id>'
      });
      return;
    }

    const response = await getIngestionJobStatus(jobId);
    await respond({
      text: `Job Status:\n${response}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-job-status');
    await respond({
      text: `Error getting job status: ${error}`
    });
  }
}
