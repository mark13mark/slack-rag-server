import { logInfo, logError } from '../utils/logging.js';
import {
  getDataSource,
  syncDataSource,
  getKnowledgeBaseStatus,
  getDataSourceConfig,
  getAgentStatus,
  listDataSources,
  getIngestionJobStatus,
  checkBedrockAgentHealth
} from '../services/bedrock.js';
import { formatDate } from '../utils/date.js';

// Handle /ragbot-get-datasource command
export async function handleGetDataSource({ command, ack, respond, logger }) {
  await ack();
  logInfo(logger, `Processing /ragbot-get-datasource command`);

  const response = await getDataSource();

  // Check if response contains an error
  if (response && response.error) {
    logError(logger, response.originalError || response.error, 'Error in /ragbot-get-datasource');
    await respond({
      text: `Error getting data source information: ${response.error}`
    });
    return;
  }

  let formattedResponse;

  if (response.status === "NO_JOBS_FOUND") {
    formattedResponse = response.message;
  } else {
    formattedResponse = `Data Source: ${response.dataSourceId}\nKnowledge Base: ${response.knowledgeBaseId}\nMessage: ${response.description}\nStatus: ${response.status}\nLast sync: ${formatDate(response.updatedAt)}`;
  }

  await respond({
    text: `DATA SOURCE INFORMATION:\n\n${formattedResponse}`
  });
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
    const formattedResponse = `Data Source: ${response.dataSourceId}\nKnowledge Base: ${response.knowledgeBaseId}\nJob ID: ${response.ingestionJobId}\nStatus: ${response.status}`;

    await respond({
      text: `DATA SOURCE SYNC INITIATED:\n\n${formattedResponse}`
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
    /ragbot-job-status <job_id> - Check the status of an ingestion job
    /ragbot-health-check - Check overall health of the Bedrock agent service`;

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

    const response = await getKnowledgeBaseStatus();
    const formattedResponse = `Knowledge Base: ${response.name}\nStatus: ${response.status}\nCreated At: ${formatDate(response.createdAt)}\nUpdated At: ${formatDate(response.updatedAt)}`;

    await respond({
      text: `KNOWLEDGE BASE STATUS:\n\n${formattedResponse}`
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
    const formattedResponse = `Data Source: ${response.name}\nStatus: ${response.status}\nConfiguration: Type: ${response.configurationType}\nCreated At: ${formatDate(response.createdAt)}\nUpdated At: ${formatDate(response.updatedAt)}`;

    await respond({
      text: `DATA SOURCE CONFIGURATION:\n\n${formattedResponse}`
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
  await ack();
  logInfo(logger, `Processing /ragbot-agent-status command`);

  const response = await getAgentStatus();

  // Check if response contains an error
  if (response && response.error) {
    logError(logger, response.originalError || response.error, 'Error in /ragbot-agent-status');
    await respond({
      text: `Error getting agent status: ${response.error}`
    });
    return;
  }

  const formattedResponse = `Agent Name: ${response.agentName}\nAgent ID: ${response.agentId}\nStatus: ${response.agentStatus}\nFoundation Model: ${response.foundationModel}\nCreated At: ${formatDate(response.createdAt)}\nUpdated At: ${formatDate(response.updatedAt)}`;

  await respond({
    text: `AGENT INFORMATION:\n\n${formattedResponse}`
  });
}

// Handle /ragbot-list-datasources command
export async function handleListDataSources({ command, ack, respond, logger }) {
  try {
    await ack();
    logInfo(logger, `Processing /ragbot-list-datasources command`);

    const response = await listDataSources();
    const formattedResponse = response.dataSources.map(source =>
      `Data Source: ${source.dataSourceId}\n Name: ${source.name}\n Status: ${source.status}\n Updated At: ${formatDate(source.updatedAt)}\n`
    ).join('\n');

    await respond({
      text: `AVAILABLE DATA SOURCES:\n\n${formattedResponse}`
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
    const failureText = response.failureReasons.length > 0 ? response.failureReasons.join('\n') : 'None';
    const formattedResponse = `Ingestion Job: ${response.ingestionJobId}\nStatus: ${response.status}\nStarted At: ${formatDate(response.startedAt)}\nUpdated At: ${formatDate(response.updatedAt)}\nStatistics: ${response.statistics}\nFailure Reasons: ${failureText}`;

    await respond({
      text: `INGESTION JOB STATUS:\n\n${formattedResponse}`
    });
  } catch (error) {
    logError(logger, error, 'Error in /ragbot-job-status');
    await respond({
      text: `Error getting job status: ${error}`
    });
  }
}

// Handle /ragbot-health-check command
export async function handleHealthCheck({ command, ack, respond, logger }) {
  await ack();
  logInfo(logger, `Processing /ragbot-health-check command`);

  const healthStatus = await checkBedrockAgentHealth();

  // Check if response contains an error
  if (healthStatus && healthStatus.error) {
    logError(logger, healthStatus.originalError || healthStatus.error, 'Error in /ragbot-health-check');
    await respond({
      text: `Error checking health status: ${healthStatus.error}`
    });
    return;
  }

  let responseText;
  if (healthStatus.healthy) {
    responseText = `✅ Ragbot is healthy and ready to use.\n\nAgent: ${healthStatus.details.agentName}\nRegion: ${healthStatus.details.region}`;
  } else {
    const issues = healthStatus.issues.map(issue => `• ${issue.component}: ${issue.message}`).join('\n');
    responseText = `❌ Ragbot has issues:\n\n${issues}`;
  }

  await respond({
    text: responseText
  });
}
