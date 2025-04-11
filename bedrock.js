import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockAgentClient, ListIngestionJobsCommand, StartIngestionJobCommand, GetKnowledgeBaseCommand, GetDataSourceCommand, GetAgentCommand, ListDataSourcesCommand, GetIngestionJobCommand, GetAgentTraceCommand } from "@aws-sdk/client-bedrock-agent";

import chalk from 'chalk'; // Add this package for colored logging
/*
Purpose and Operations:

BedrockAgentClient: Used for management operations like creating, updating, deleting, and configuring agents and knowledge bases. This includes operations like CreateAgent, DeleteKnowledgeBase, GetKnowledgeBase, etc.
BedrockAgentRuntimeClient: Used for runtime interactions with existing agents and knowledge bases. This includes operations like InvokeAgent, Retrieve, RetrieveAndGenerate, etc.
*/

/**
 * Formats the traceback information in a Slack-friendly way
 * @param {Object} traceback - The traceback object from the agent response
 * @returns {string} Formatted traceback information
 */
function formatTraceback(traceback) {
  if (!traceback) return "No traceback information available";

  let formattedOutput = "```\n🤖 Agent Traceback\n================\n";

  // Format each step in the traceback
  if (traceback.steps && Array.isArray(traceback.steps)) {
    traceback.steps.forEach((step, index) => {
      formattedOutput += `\n🔹 Step ${index + 1}: ${step.type}\n`;
      formattedOutput += `📊 Status: ${step.status}\n`;

      if (step.input) {
        formattedOutput += "📥 Input:\n";
        formattedOutput += JSON.stringify(step.input, null, 2) + "\n";
      }

      if (step.output) {
        formattedOutput += "📤 Output:\n";
        formattedOutput += JSON.stringify(step.output, null, 2) + "\n";
      }

      if (step.error) {
        formattedOutput += "❌ Error:\n";
        formattedOutput += JSON.stringify(step.error, null, 2) + "\n";
      }

      formattedOutput += "----------------------------------------\n";
    });
  }

  // Add timing information if available
  if (traceback.createdAt) {
    formattedOutput += `\n⏱️ Trace started at: ${new Date(traceback.createdAt).toLocaleString()}\n`;
  }
  if (traceback.updatedAt) {
    formattedOutput += `⏱️ Last updated at: ${new Date(traceback.updatedAt).toLocaleString()}\n`;
  }

  formattedOutput += "```";
  return formattedOutput;
}

// Invoke the Bedrock agent with the provided input text
async function invokeBedrockAgent({inputText, sessionId, attachments = [], includeTraceback = false}) {
  console.log(chalk.magenta(`Session Sample ID: ${sessionId}`));
  try {
    // Create AWS SDK client with credentials and region
    const client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_BEDROCK_REGION,
      logger: console,
    });

    // Set up the parameters for the InvokeAgent operation
    const input = {
      agentAliasId: process.env.AWS_BEDROCK_AGENT_ALIAS_ID,
      agentId: process.env.AWS_BEDROCK_AGENT_ID,
      sessionId,
      enableTrace: true,
      inputText
    };

    // Add attachments if provided
    if (attachments?.length > 0) {
      input.files = [];
      attachments.forEach(attachment => {
        input.files.push({
          name: attachment.name,
          source: {
            byteContent: {
              data: Buffer.from(attachment.data).toString('base64'),
              mediaType: attachment.mediaType
            },
            sourceType: 'BYTE_CONTENT'
          },
          useCase: 'CHAT'
        });
      });
    }

    // Create and execute the InvokeAgent command
    const command = new InvokeAgentCommand(input);
    const output = await client.send(command);

    // Process the streaming response
    let result = '';
    let traceback = null;
    console.log(`length of output events:`, output.completion);

    for await (const event of output.completion) {
      if (event.chunk) {
        result += new TextDecoder().decode(event.chunk.bytes);
      }
      // Capture traceback information if available
      if (event.trace) {
        traceback = event.trace;
      }
    }

    console.log('AWS Bedrock agent response:', result);

    // Return both response and formatted traceback if requested
    if (includeTraceback) {
      return {
        response: result,
        traceback: formatTraceback(traceback)
      };
    }

    return result;

  } catch (error) {
    console.error('Error invoking Bedrock agent:', error);
    throw error;
  }
}

async function getDataSourceMetadata() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  // Retireve the last ingestion job for the data source
  // TODO: Update to loop through all data sources to grab the last ingestion job
  const command = new ListIngestionJobsCommand({
    knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
    dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID,
    maxResults: 1,
    sortBy: {
      attribute: "STARTED_AT",
      order: "DESCENDING",
    }
  });

  try {
    let formattedDates = '';
    const response = await client.send(command);

    console.log("Last synchronized:", response);

    //Check if we have ingestion jobs
    // TODO: Update to add knowledge base info and data source listings
    if (response.ingestionJobSummaries && response.ingestionJobSummaries.length > 0) {
      // Display information for each job
      response.ingestionJobSummaries.forEach(ingestionJob => {
        console.log(`Knowledge Base ID: ${ingestionJob.knowledgeBaseId}`);
        console.log(`Data Source ID: ${ingestionJob.dataSourceId}`);
        console.log(`Status: ${ingestionJob.status}`);
        console.log(`Started At: ${ingestionJob.startedAt}`);
        console.log(`Last Sync Time: ${ingestionJob.updatedAt}`);
        console.log("--------------------------");

        const date = new Date(ingestionJob.updatedAt);
        const formattedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        formattedDates += `Last Sync Date: ${formattedDate}, Last Sync Status: ${ingestionJob.status}`;

      });
    } else {
      console.log("No data sources found for this knowledge base.");
    }

    return formattedDates;
  } catch (error) {
    console.error("Error fetching knowledge base info:", error);
  }
}

// Trigger a manual sync of the data source
// TODO Set to admins or team leads only to prevent too many triggers
async function syncDataSource() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  const command = new StartIngestionJobCommand({
    knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
    dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID,
    description: "Manual sync triggered on " + new Date().toISOString()
  });

  try {
    const response = await client.send(command);
    console.log("Sync job started successfully:", response);

    // { // StartIngestionJobResponse
//   ingestionJob: { // IngestionJob
//     knowledgeBaseId: "STRING_VALUE", // required
//     dataSourceId: "STRING_VALUE", // required
//     ingestionJobId: "STRING_VALUE", // required
//     description: "STRING_VALUE",
//     status: "STARTING" || "IN_PROGRESS" || "COMPLETE" || "FAILED" || "STOPPING" || "STOPPED", // required
//     statistics: { // IngestionJobStatistics
//       numberOfDocumentsScanned: Number("long"),
//       numberOfMetadataDocumentsScanned: Number("long"),
//       numberOfNewDocumentsIndexed: Number("long"),
//       numberOfModifiedDocumentsIndexed: Number("long"),
//       numberOfMetadataDocumentsModified: Number("long"),
//       numberOfDocumentsDeleted: Number("long"),
//       numberOfDocumentsFailed: Number("long"),
//     },
//     failureReasons: [ // FailureReasons
//       "STRING_VALUE",
//     ],
//     startedAt: new Date("TIMESTAMP"), // required
//     updatedAt: new Date("TIMESTAMP"), // required
//   },
// };
    return response.ingestionJob.ingestionJobId;
  } catch (error) {
    console.error("Error starting knowledge base sync:", error);
    throw error;
  }
}

export { invokeBedrockAgent, getDataSourceMetadata, syncDataSource };

// =============================================
// Additional Management Functions
// =============================================

/**
 * Retrieves the current status and configuration of the knowledge base
 * @returns {Promise<Object>} Knowledge base status and configuration
 */
async function getKnowledgeBaseStatus() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetKnowledgeBaseCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID
    });

    const response = await client.send(command);
    return {
      status: response.knowledgeBase.status,
      name: response.knowledgeBase.name,
      description: response.knowledgeBase.description,
      roleArn: response.knowledgeBase.roleArn,
      createdAt: response.knowledgeBase.createdAt,
      updatedAt: response.knowledgeBase.updatedAt
    };
  } catch (error) {
    console.error("Error fetching knowledge base status:", error);
    throw error;
  }
}

/**
 * Retrieves the configuration details of a specific data source
 * @returns {Promise<Object>} Data source configuration details
 */
async function getDataSourceConfig() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetDataSourceCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID
    });

    const response = await client.send(command);
    return {
      name: response.dataSource.name,
      status: response.dataSource.status,
      dataSourceConfiguration: response.dataSource.dataSourceConfiguration,
      createdAt: response.dataSource.createdAt,
      updatedAt: response.dataSource.updatedAt
    };
  } catch (error) {
    console.error("Error fetching data source configuration:", error);
    throw error;
  }
}

/**
 * Retrieves the current status and configuration of the agent
 * @returns {Promise<Object>} Agent status and configuration
 */
async function getAgentStatus() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetAgentCommand({
      agentId: process.env.AWS_BEDROCK_AGENT_ID
    });

    const response = await client.send(command);
    return {
      name: response.agent.name,
      status: response.agent.status,
      description: response.agent.description,
      foundationModel: response.agent.foundationModel,
      createdAt: response.agent.createdAt,
      updatedAt: response.agent.updatedAt
    };
  } catch (error) {
    console.error("Error fetching agent status:", error);
    throw error;
  }
}

/**
 * Lists all data sources associated with the knowledge base
 * @returns {Promise<Array>} List of data sources with their basic information
 */
async function listDataSources() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new ListDataSourcesCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID
    });

    const response = await client.send(command);
    return response.dataSourceSummaries.map(source => ({
      id: source.dataSourceId,
      name: source.name,
      status: source.status,
      updatedAt: source.updatedAt
    }));
  } catch (error) {
    console.error("Error listing data sources:", error);
    throw error;
  }
}

/**
 * Retrieves the status and details of a specific ingestion job
 * @param {string} jobId - The ID of the ingestion job to check
 * @returns {Promise<Object>} Ingestion job status and statistics
 */
async function getIngestionJobStatus(jobId) {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetIngestionJobCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID,
      ingestionJobId: jobId
    });

    const response = await client.send(command);
    return {
      status: response.ingestionJob.status,
      startedAt: response.ingestionJob.startedAt,
      updatedAt: response.ingestionJob.updatedAt,
      statistics: response.ingestionJob.statistics,
      failureReasons: response.ingestionJob.failureReasons
    };
  } catch (error) {
    console.error("Error fetching ingestion job status:", error);
    throw error;
  }
}

export {
  getKnowledgeBaseStatus,
  getDataSourceConfig,
  getAgentStatus,
  listDataSources,
  getIngestionJobStatus
};

/**
 * Retrieves the traceback of an agent's logic for a specific session
 * @param {string} sessionId - The session ID to get the traceback for
 * @returns {Promise<Object>} The agent's traceback information including steps, decisions, and responses
 */
async function getAgentTraceback(sessionId) {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetAgentTraceCommand({
      agentId: process.env.AWS_BEDROCK_AGENT_ID,
      sessionId: sessionId
    });

    const response = await client.send(command);
    return {
      traceId: response.traceId,
      sessionId: response.sessionId,
      steps: response.steps,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt
    };
  } catch (error) {
    console.error("Error fetching agent traceback:", error);
    throw error;
  }
}

export { getAgentTraceback };
