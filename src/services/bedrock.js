import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockAgentClient, ListIngestionJobsCommand, StartIngestionJobCommand, GetKnowledgeBaseCommand, GetDataSourceCommand, GetAgentCommand, ListDataSourcesCommand, GetIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";

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

// Check if the AWS Bedrock agent service is healthy and ready to use
async function checkBedrockAgentHealth() {
  const issues = [];
  const details = {
    region: process.env.AWS_BEDROCK_REGION,
    agentId: process.env.AWS_BEDROCK_AGENT_ID,
    agentAliasId: process.env.AWS_BEDROCK_AGENT_ALIAS_ID
  };

  try {
    // Check agent status using existing function
    try {
      const agentStatus = await getAgentStatus();

      details.agentName = agentStatus.agentName;

      if (agentStatus.agentStatus !== 'PREPARED' && agentStatus.agentStatus !== 'READY') {
        issues.push({
          component: 'Agent',
          status: agentStatus.agentStatus,
          message: `Agent is not in a ready state. Current status: ${agentStatus.agentStatus}`
        });
      }
    } catch (agentError) {
      console.error('Error checking agent status:', agentError);
      issues.push({
        component: 'Agent',
        status: 'ERROR',
        message: `Failed to check Agent status: ${agentError.message}`
      });
    }

    // Check knowledge base status if configured
    if (process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID) {
      try {
        const kbStatus = await getKnowledgeBaseStatus();

        details.knowledgeBaseName = kbStatus.name;

        if (kbStatus.status !== 'ACTIVE') {
          issues.push({
            component: 'Knowledge Base',
            status: kbStatus.status,
            message: `Knowledge Base is not active. Current status: ${kbStatus.status}`
          });
        }
      } catch (kbError) {
        console.error('Error checking knowledge base status:', kbError);
        issues.push({
          component: 'Knowledge Base',
          status: 'ERROR',
          message: `Failed to check Knowledge Base status: ${kbError.message}`
        });
      }
    }

    // Return final health status
    return {
      healthy: issues.length === 0,
      issues,
      details
    };
  } catch (error) {
    console.error('Error checking Bedrock agent health:', error);
    return {
      healthy: false,
      issues: [{
        component: 'Bedrock Service',
        status: 'ERROR',
        message: `Failed to check Bedrock service health: ${error.message}`
      }]
    };
  }
}

// Invoke the Bedrock agent with the provided input text
async function invokeBedrockAgent({inputText, sessionId, attachments = [], includeTraceback = false}) {
  console.log(`Session Sample ID: ${sessionId}`);

  // Check agent health before attempting to invoke
  const healthStatus = await checkBedrockAgentHealth();
  if (!healthStatus.healthy) {
    const issues = healthStatus.issues.map(issue => `${issue.component}: ${issue.message}`).join('\n');
    return { error: `AWS Bedrock agent service is not healthy: \n${issues}` };
  }

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
    return { error: error.message, originalError: error };
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

    return {
      name: response.knowledgeBase.name,
      status: response.knowledgeBase.status,
      createdAt: response.knowledgeBase.createdAt,
      updatedAt: response.knowledgeBase.updatedAt,
      id: response.knowledgeBase.knowledgeBaseId,
      rawResponse: response.knowledgeBase
    };
  } catch (error) {
    console.error("Error fetching knowledge base status:", error);
    return { error: error.message, originalError: error };
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

    return {
      agentName: response.agent.agentName,
      agentId: response.agent.agentId,
      agentStatus: response.agent.agentStatus,
      foundationModel: response.agent.foundationModel,
      createdAt: response.agent.createdAt,
      updatedAt: response.agent.updatedAt,
      rawResponse: response.agent
    };
  } catch (error) {
    console.error("Error fetching agent status:", error);
    return { error: error.message, originalError: error };
  }
}

// Retrieves the metadata for the data source
async function getDataSource() {
  const client = new BedrockAgentClient({ region: process.env.AWS_BEDROCK_REGION });

  // Retrieve the last ingestion job for the data source
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
    const response = await client.send(command);
    console.log("Last synchronized:", response);

    //Check if we have ingestion jobs
    if (response.ingestionJobSummaries && response.ingestionJobSummaries.length > 0) {
      // Return information about the most recent job
      const job = response.ingestionJobSummaries[0];
      return {
        dataSourceId: job.dataSourceId,
        knowledgeBaseId: job.knowledgeBaseId,
        description: job.description,
        status: job.status,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        rawResponse: job
      };
    } else {
      return {
        status: "NO_JOBS_FOUND",
        message: "No data sources found for this knowledge base."
      };
    }
  } catch (error) {
    console.error("Error fetching knowledge base info:", error);
    return { error: error.message, originalError: error };
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

    return {
      dataSources: response.dataSourceSummaries.map(source => ({
        dataSourceId: source.dataSourceId,
        name: source.name,
        status: source.status,
        updatedAt: source.updatedAt,
        rawResponse: source
      })),
      count: response.dataSourceSummaries.length
    };
  } catch (error) {
    console.error("Error listing data sources:", error);
    return { error: error.message, originalError: error };
  }
}

// Trigger a manual sync of the data source
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

    return {
      dataSourceId: response.ingestionJob.dataSourceId,
      knowledgeBaseId: response.ingestionJob.knowledgeBaseId,
      ingestionJobId: response.ingestionJob.ingestionJobId,
      status: response.ingestionJob.status,
      rawResponse: response.ingestionJob
    };
  } catch (error) {
    console.error("Error starting knowledge base sync:", error);
    return { error: error.message, originalError: error };
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

    return {
      name: response.dataSource.name,
      status: response.dataSource.status,
      configurationType: response.dataSource.dataSourceConfiguration.type,
      createdAt: response.dataSource.createdAt,
      updatedAt: response.dataSource.updatedAt,
      rawResponse: response.dataSource
    };
  } catch (error) {
    console.error("Error fetching data source configuration:", error);
    return { error: error.message, originalError: error };
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

    return {
      ingestionJobId: response.ingestionJob.ingestionJobId,
      status: response.ingestionJob.status,
      startedAt: response.ingestionJob.startedAt,
      updatedAt: response.ingestionJob.updatedAt,
      statistics: response.ingestionJob.statistics,
      failureReasons: response.ingestionJob.failureReasons,
      rawResponse: response.ingestionJob
    };
  } catch (error) {
    console.error("Error fetching ingestion job status:", error);
    return { error: error.message, originalError: error };
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
  getIngestionJobStatus,
  checkBedrockAgentHealth
};
