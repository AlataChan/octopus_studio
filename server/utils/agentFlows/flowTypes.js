const FLOW_TYPES = {
  START: {
    type: "start",
    description: "Initialize flow variables",
    parameters: {
      variables: {
        type: "array",
        description: "List of variables to initialize",
      },
    },
  },
  API_CALL: {
    type: "apiCall",
    description: "Make an HTTP request to an API endpoint",
    parameters: {
      url: { type: "string", description: "The URL to make the request to" },
      method: { type: "string", description: "HTTP method (GET, POST, etc.)" },
      headers: {
        type: "array",
        description: "Request headers as key-value pairs",
      },
      bodyType: {
        type: "string",
        description: "Type of request body (json, form)",
      },
      body: {
        type: "string",
        description:
          "Request body content. If body type is json, always return a valid json object. If body type is form, always return a valid form data object.",
      },
      formData: { type: "array", description: "Form data as key-value pairs" },
      responseVariable: {
        type: "string",
        description: "Variable to store the response",
      },
      directOutput: {
        type: "boolean",
        description:
          "Whether to return the response directly to the user without LLM processing",
      },
    },
    examples: [
      {
        url: "https://api.example.com/data",
        method: "GET",
        headers: [{ key: "Authorization", value: "Bearer 1234567890" }],
      },
    ],
  },
  LLM_INSTRUCTION: {
    type: "llmInstruction",
    description: "Process data using LLM instructions",
    parameters: {
      instruction: {
        type: "string",
        description: "The instruction for the LLM to follow",
      },
      resultVariable: {
        type: "string",
        description: "Variable to store the processed result",
      },
    },
  },
  WEB_SCRAPING: {
    type: "webScraping",
    description: "Scrape content from a webpage",
    parameters: {
      url: {
        type: "string",
        description: "The URL of the webpage to scrape",
      },
      resultVariable: {
        type: "string",
        description: "Variable to store the scraped content",
      },
      directOutput: {
        type: "boolean",
        description:
          "Whether to return the scraped content directly to the user without LLM processing",
      },
    },
  },
  SUBFLOW: {
    type: "subflow",
    description:
      "Execute another flow as a sub-process with role-based context",
    parameters: {
      flowId: {
        type: "string",
        description: "The ID of the sub-flow to execute",
      },
      roleName: {
        type: "string",
        description:
          "Role name for this sub-flow (e.g., 'researcher', 'writer')",
      },
      roleDescription: {
        type: "string",
        description: "Description of what this role does in the workflow",
      },
      inputMapping: {
        type: "object",
        description:
          "Mapping of blackboard keys to sub-flow input variables. Example: { 'query': 'user_query', 'context': 'previous_results' }",
      },
      outputKey: {
        type: "string",
        description:
          "Key to store the sub-flow output in the blackboard (e.g., 'researcher_output')",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds for sub-flow execution (default: 300)",
      },
      onError: {
        type: "string",
        description:
          "Error handling strategy: 'fail' (stop execution), 'continue' (skip and continue), 'retry' (retry once)",
      },
    },
    examples: [
      {
        flowId: "research-flow-uuid",
        roleName: "researcher",
        roleDescription: "Collects and organizes relevant information",
        inputMapping: {
          query: "user_query",
          sources: "available_sources",
        },
        outputKey: "researcher_output",
        timeout: 300,
        onError: "fail",
      },
    ],
  },
};

module.exports.FLOW_TYPES = FLOW_TYPES;
