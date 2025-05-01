import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockAgentClient, ListIngestionJobsCommand, StartIngestionJobCommand, GetKnowledgeBaseCommand, GetDataSourceCommand, GetAgentCommand, ListDataSourcesCommand, GetIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { formatDate } from '../utils/date.js';
/*
Purpose and Operations:

BedrockAgentClient: Used for management operations like creating, updating, deleting, and configuring agents and knowledge bases. This includes operations like CreateAgent, DeleteKnowledgeBase, GetKnowledgeBase, etc.
BedrockAgentRuntimeClient: Used for runtime interactions with existing agents and knowledge bases. This includes operations like InvokeAgent, Retrieve, RetrieveAndGenerate, etc.
*/

// Formats the traceback information in a Slack-friendly way
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

  formattedOutput += "```";
  return formattedOutput;
}

// Invoke the Bedrock agent with the provided input text
async function invokeBedrockAgent({inputText, sessionId, attachments = [], includeTraceback = false}) {
  console.log(`Session Sample ID: ${sessionId}`);
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

// Retrieves the current status and configuration of the knowledge base
async function getKnowledgeBaseStatus() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetKnowledgeBaseCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID
    });

    const response = await client.send(command);
    console.log("Knowledge base response:", response);
    const formattedResponse = `Knowledge Base: ${response.knowledgeBase.name}\nStatus: ${response.knowledgeBase.status}\nCreated At: ${formatDate(response.knowledgeBase.createdAt)}\nUpdated At: ${formatDate(response.knowledgeBase.updatedAt)}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error fetching knowledge base status:", error);
    throw error;
  }
}

// Retrieves the current status and configuration of the agent
async function getAgentStatus() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetAgentCommand({
      agentId: process.env.AWS_BEDROCK_AGENT_ID
    });

    const response = await client.send(command);
    console.log("Agent response:", response);
    const formattedResponse = `Agent Name: ${response.agent.agentName}\nAgent ID: ${response.agent.agentId}\nStatus: ${response.agent.agentStatus}\nFoundation Model: ${response.agent.foundationModel}\nCreated At: ${formatDate(response.agent.createdAt)}\nUpdated At: ${formatDate(response.agent.updatedAt)}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error fetching agent status:", error);
    throw error;
  }
}


// Retrieves the metadata for the data source
async function getDataSource() {
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
    let formattedLines = '';
    const response = await client.send(command);

    console.log("Last synchronized:", response);

    //Check if we have ingestion jobs
    if (response.ingestionJobSummaries && response.ingestionJobSummaries.length > 0) {
      // Display information for each job
      response.ingestionJobSummaries.forEach(ingestionJob => {
        console.log(`Knowledge Base ID: ${ingestionJob.knowledgeBaseId}`);
        console.log(`Data Source ID: ${ingestionJob.dataSourceId}`);
        console.log(`Status: ${ingestionJob.status}`);
        console.log(`Started At: ${ingestionJob.startedAt}`);
        console.log(`Last Sync Time: ${ingestionJob.updatedAt}`);
        console.log("--------------------------");

        const formattedDate = formatDate(ingestionJob.updatedAt);
        formattedLines += `Data Source: ${ingestionJob.dataSourceId}\nKnowledge Base: ${ingestionJob.knowledgeBaseId}\nMessage: ${ingestionJob.description}\nStatus: ${ingestionJob.status}\nLast sync: ${formattedDate}\n\n`;
      });
    } else {
      console.log("No data sources found for this knowledge base.");
    }

    return formattedLines;
  } catch (error) {
    console.error("Error fetching knowledge base info:", error);
  }
}

// Lists all data sources associated with the knowledge base
async function listDataSources() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new ListDataSourcesCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID
    });

    const response = await client.send(command);
    console.log("Data source list response:", response);
    const formattedResponse = `${response.dataSourceSummaries.map(source => `Data Source: ${source.dataSourceId}\n Name: ${source.name}\n Status: ${source.status}\n Updated At: ${formatDate(source.updatedAt)}\n\n`).join('')}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error listing data sources:", error);
    throw error;
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
    const formattedResponse = `Data Source Sync Initiated. Data Source: ${response.ingestionJob.dataSourceId}\nKnowledge Base: ${response.ingestionJob.knowledgeBaseId}\nJob ID: ${response.ingestionJob.ingestionJobId}\nStatus: ${response.ingestionJob.status}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error starting knowledge base sync:", error);
    throw error;
  }
}

// Retrieves the configuration details of a specific data source
async function getDataSourceConfig() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetDataSourceCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID
    });

    const response = await client.send(command);
    console.log("Data source response:", response);
    const formattedResponse = `Data Source: ${response.dataSource.name}\nStatus: ${response.dataSource.status}\nConfiguration: Type: ${response.dataSource.dataSourceConfiguration.type}\nCreated At: ${formatDate(response.dataSource.createdAt)}\nUpdated At: ${formatDate(response.dataSource.updatedAt)}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error fetching data source configuration:", error);
    throw error;
  }
}

// Retrieves the status and details of a specific ingestion job
async function getIngestionJobStatus(jobId) {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  try {
    const command = new GetIngestionJobCommand({
      knowledgeBaseId: process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.AWS_BEDROCK_DATA_SOURCE_ID,
      ingestionJobId: jobId
    });

    const response = await client.send(command);
    console.log("Ingestion job response:", response);
    const formattedResponse = `Ingestion Job: ${response.ingestionJob.ingestionJobId}\nStatus: ${response.ingestionJob.status}\nStarted At: ${formatDate(response.ingestionJob.startedAt)}\nUpdated At: ${formatDate(response.ingestionJob.updatedAt)}\nStatistics: ${response.ingestionJob.statistics}\nFailure Reasons: ${response.ingestionJob.failureReasons.length > 0 ? response.ingestionJob.failureReasons.join('\n') : 'None'}`;
    return formattedResponse;
  } catch (error) {
    console.error("Error fetching ingestion job status:", error);
    throw error;
  }
}

export {
  invokeBedrockAgent,
  getDataSource,
  syncDataSource,
  getKnowledgeBaseStatus,
  getDataSourceConfig,
  getAgentStatus,
  listDataSources,
  getIngestionJobStatus
};
