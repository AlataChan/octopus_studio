const TRANSLATIONS = {
  onboarding: {
    home: {
      title: "Welcome to",
      getStarted: "Get Started",
    },
    llm: {
      title: "LLM Preference",
      description:
        "Octopus Studio can work with many LLM providers. This will be the service which handles chatting.",
    },
    userSetup: {
      title: "User Setup",
      description: "Configure your user settings.",
      howManyUsers: "How many users will be using this instance?",
      justMe: "Just me",
      myTeam: "My team",
      instancePassword: "Instance Password",
      setPassword: "Would you like to set up a password?",
      passwordReq: "Passwords must be at least 8 characters.",
      passwordWarn:
        "It's important to save this password because there is no recovery method.",

      adminUsername: "Admin account username",
      adminUsernameReq:
        "Username must be at least 6 characters long and only contain lowercase letters, numbers, underscores, and hyphens with no spaces.",
      adminPassword: "Admin account password",
      adminPasswordReq: "Passwords must be at least 8 characters.",
      teamHint:
        "By default, you will be the only admin. Once onboarding is completed you can create and invite others to be users or admins. Do not lose your password as only admins can reset passwords.",
    },
    data: {
      title: "Data Handling & Privacy",
      description:
        "We are committed to transparency and control when it comes to your personal data.",
      settingsHint:
        "These settings can be reconfigured at any time in the settings.",
    },
    survey: {
      title: "Welcome to Octopus Studio",
      description:
        "Help us make Octopus Studio built for your needs. Optional.",

      email: "What's your email?",
      useCase: "What will you use Octopus Studio for?",
      useCaseWork: "For work",
      useCasePersonal: "For personal use",
      useCaseOther: "Other",
      comment: "How did you hear about Octopus Studio?",
      commentPlaceholder:
        "Reddit, Twitter, GitHub, YouTube, etc. - Let us know how you found us!",
      skip: "Skip Survey",
      thankYou: "Thank you for your feedback!",
    },
    workspace: {
      title: "Create your first workspace",
      description:
        "Create your first workspace and get started with Octopus Studio.",
    },
  },
  common: {
    "workspaces-name": "Workspaces Name",
    error: "error",
    success: "success",
    user: "User",
    selection: "Model Selection",
    saving: "Saving...",
    save: "Save changes",
    previous: "Previous Page",
    next: "Next Page",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    search: "Search",
  },
  home: {
    welcome: "Welcome",
    chooseWorkspace: "Choose a workspace to start chatting!",
    notAssigned:
      "You currently aren't assigned to any workspaces.\nPlease contact your administrator to request access to a workspace.",
    goToWorkspace: 'Go to "{{workspace}}"',
  },

  // Setting Sidebar menu items.
  settings: {
    title: "Instance Settings",
    system: "General Settings",
    invites: "Invites",
    users: "Users",
    workspaces: "Workspaces",
    "workspace-chats": "Workspace Chats",
    customization: "Customization",
    interface: "UI Preferences",
    branding: "Branding & Whitelabeling",
    chat: "Chat",
    "api-keys": "Developer API",
    llm: "LLM",
    transcription: "Transcription",
    embedder: "Embedder",
    "text-splitting": "Text Splitter & Chunking",
    "voice-speech": "Voice & Speech",
    "vector-database": "Vector Database",
    embeds: "Chat Embed",
    "embed-chats": "Chat Embed History",
    security: "Security",
    "event-logs": "Event Logs",
    privacy: "Privacy & Data",
    "ai-providers": "AI Providers",
    "agent-skills": "Agent Skills",
    admin: "Admin",
    tools: "Tools",
    "system-prompt-variables": "System Prompt Variables",
    "experimental-features": "Experimental Features",
    contact: "Contact Support",
    "browser-extension": "Browser Extension",
    observability: "Observability",
    billing: "Billing",
    "ai-system": "AI System",
    "knowledge-graph": "Knowledge Graph",
    "my-billing": "My Billing",
  },
  visualProduction: {
    nav: "Visual Production",
  },
  "molt.console.agents.title": "Molt Agents",
  "molt.console.agents.empty": "No Molt agents found.",
  "molt.console.agents.empty_hint": "Complete Matrix setup in Molt first.",
  "molt.console.agents.loading": "Loading Molt agents...",
  "molt.console.agents.fetch_error": "Unable to load Molt agents.",
  "molt.console.agents.chat_action": "Chat",
  "molt.console.agents.attach_action": "Attach to workspace",
  "molt.console.chat.title": "Chat with {{agent}}",
  "molt.console.chat.send": "Send",
  "molt.console.chat.loading": "Sending...",
  "molt.console.chat.error": "Unable to chat with this Molt agent.",
  "molt.console.chat.placeholder": "Ask this Molt agent a question...",
  "molt.console.chat.close": "Close",
  "molt.console.attach.title": "Attach {{agent}} to workspace",
  "molt.console.attach.workspace_label": "Workspace",
  "molt.console.attach.display_name_label": "Display name",
  "molt.console.attach.submit": "Attach",
  "molt.console.attach.cancel": "Cancel",
  "molt.console.attach.loading": "Attaching...",
  "molt.console.attach.success_title": "Attached.",
  "molt.console.attach.success_link": "Open workspace AI Team →",
  "molt.console.attach.error_403":
    "You need workspace admin permission to attach this Molt agent.",
  "molt.console.attach.error_generic": "Unable to attach this Molt agent.",
  "molt.console.attach.no_workspaces": "No workspaces available.",
  "molt.console.km.section_title": "KM & Files",
  "molt.console.km.status.configured": "KM configured",
  "molt.console.km.status.not_configured": "KM not configured",
  "molt.console.km.status.disabled": "KM disabled",
  "molt.console.km.status.loading": "Loading KM status...",
  "molt.console.km.status.error": "Unable to load KM status.",
  "molt.console.km.status.no_data": "No KM data reported.",
  "molt.console.files.section_title": "Upload Text File",
  "molt.console.files.filename_label": "Filename",
  "molt.console.files.content_label": "Content",
  "molt.console.files.agent_label": "Molt agent",
  "molt.console.files.agent_placeholder": "Select a Molt agent",
  "molt.console.files.upload": "Upload",
  "molt.console.files.loading": "Uploading...",
  "molt.console.files.success": "Text file uploaded.",
  "molt.console.files.error_generic": "Unable to upload text file.",
  "molt.console.files.validation_required":
    "Filename, content, and agent are required.",
  "molt.console.reconnect.button": "Reconnect",
  "molt.console.reconnect.loading": "Reconnecting...",
  "molt.console.reconnect.success": "Molt reconnected.",
  "molt.console.reconnect.failed": "Unable to reconnect Molt.",
  "molt.console.matrix_init.title":
    "Molt is connected but Matrix is not initialized",
  "molt.console.matrix_init.subtitle":
    "Complete Matrix setup before agents can be listed or used from Octopus Studio.",
  "molt.console.matrix_init.dashboard_button": "Initialize in Molt dashboard",
  "molt.console.matrix_init.one_click_button": "Initialize here",
  "molt.console.matrix_init.no_admin_token_hint":
    "Configure MOLT_ADMIN_TOKEN to initialize Matrix from Octopus Studio.",
  "molt.console.matrix_init.loading": "Initializing...",
  "molt.console.matrix_init.success": "Matrix initialized.",
  "molt.console.matrix_init.error_401":
    "Matrix init was rejected. Configure MOLT_ADMIN_TOKEN with init permissions.",
  "molt.console.matrix_init.error_generic": "Matrix init failed.",
  "molt.aiTeam.section_title": "Molt Agents",
  "molt.aiTeam.empty": "No Molt agents attached.",
  "molt.aiTeam.empty_hint": "Connect from SGA-Molt Console.",
  "molt.aiTeam.loading": "Loading workspace Molt agents...",
  "molt.aiTeam.badge": "Molt",
  "molt.aiTeam.disable": "Disable",
  "molt.aiTeam.enable": "Enable",
  "molt.aiTeam.remove": "Remove",
  "molt.aiTeam.remove_confirm": "Remove this Molt agent from the workspace?",
  "molt.aiTeam.fetch_error": "Unable to load workspace Molt agents.",
  "molt.aiTeam.orphan_badge": "Removed in Molt",
  "molt.aiTeam.last_seen": "Last seen: {{time}}",
  "molt.aiTeam.restore_button": "Restore",
  "molt.aiTeam.restore_success": "Molt agent restored.",
  "molt.aiTeam.restore_failed": "Unable to restore Molt agent.",
  "molt.aiTeam.molt_offline_banner":
    "SGA-Molt is offline. Agent status may be stale.",
  "molt.chat.mention_badge": "Molt",
  "molt.chat.bubble_label": "via SGA-Molt: {{agent}}",
  "molt.chat.offline_error": "{{agent}} is offline. Please try again later.",
  "molt.chat.thread_stale_title": "Molt thread not found.",
  "molt.chat.thread_stale_action": "Start new conversation",
  "molt.chat.multi_molt_warning":
    "Only one Molt agent can be called at a time. The first Molt mention was used.",
  "molt.chat.send_error_generic": "Unable to send message to this Molt agent.",
  // Admin pages
  "admin-invites": {
    title: "Invitations",
    description:
      "Create invitation links for people in your organization to accept and sign up with. Invitations can only be used by a single user.",
    "create-invite": "Create Invite Link",
    table: {
      status: "Status",
      "accepted-by": "Accepted By",
      "created-by": "Created By",
      created: "Created",
    },
    "no-invites": "No invitations found",
  },
  "admin-users": {
    title: "Users",
    description:
      "These are all the accounts which have an account on this instance. Removing an account will instantly remove their access to this instance.",
    "add-user": "Add user",
    table: {
      username: "Username",
      role: "Role",
      "date-added": "Date Added",
    },
    "role-hint": {
      default: [
        "Can only send chats with workspaces they have been added to by admin or managers.",
        "Cannot modify any settings.",
      ],
      manager: [
        "Can view, create, and delete any workspaces and modify workspace-specific settings.",
        "Can create, update, and invite new users to the instance.",
        "Cannot modify LLM, vectorDB, embedding, or other connections.",
      ],
      admin: [
        "Highest user level privilege.",
        "Can see and do everything across the system.",
      ],
    },
    permissions: "Permissions",
    "limit-messages": "Limit messages per day",
    "limit-messages-desc":
      "Restrict this user to a number of successful queries or chats within a 24 hour window.",
    "message-limit": "Message limit per day",
  },
  "admin-workspaces": {
    title: "Instance Workspaces",
    description:
      "These are all the workspaces that exist on this instance. Removing a workspace will delete all of its associated chats and settings.",
    "new-workspace": "New Workspace",
    table: {
      name: "Name",
      link: "Link",
      users: "Users",
      "created-on": "Created On",
    },
  },
  "chat-embed": {
    title: "Chat Embed",
    back: "Back",
    widgets: "Widgets",
    history: "History",
  },
  "system-prompt-variables": {
    title: "System Prompt Variables",
    description:
      "System prompt variables are used to store configuration values that can be referenced in system prompts for dynamic content.",
    "add-variable": "Add Variable",
    "no-variables": "No variables found",
    table: {
      key: "Key",
      value: "Value",
      description: "Description",
      type: "Type",
    },
  },
  "knowledge-graph": {
    title: "Knowledge Graph Settings",
    description:
      "Configure knowledge graph features to enhance document retrieval and relationship discovery.",
    "circuit-breaker": {
      open: "Circuit Breaker Open",
      "open-description":
        "Knowledge graph features are temporarily disabled after {{count}} consecutive failures.",
      reset: "Reset",
    },
    features: {
      title: "Feature Toggles",
      description:
        "Enable or disable specific knowledge graph capabilities. These features enhance RAG retrieval quality.",
      "guided-retrieval": {
        title: "Graph-Guided Retrieval",
        description:
          "Use knowledge graph relationships to find additional relevant documents during search.",
      },
      "entity-extraction": {
        title: "Entity Extraction",
        description:
          "Automatically extract entities and relationships from documents using LLM.",
        warning:
          "Enabling this feature will increase LLM token usage during document embedding.",
      },
      "similarity-edges": {
        title: "Structural Similarity Edges",
        description:
          "Build additional edges between structurally similar documents based on metadata.",
      },
      "path-finder": {
        title: "Path Finder",
        description:
          "Find shortest paths between documents in the knowledge graph for relationship discovery.",
      },
    },
    performance: {
      title: "Performance Settings",
      description:
        "Configure timeout and circuit breaker thresholds for knowledge graph operations.",
      "search-timeout": {
        label: "Search Timeout (ms)",
        description:
          "Maximum time to wait for knowledge graph search operations.",
      },
      "circuit-breaker-threshold": {
        label: "Circuit Breaker Threshold",
        description:
          "Number of consecutive failures before temporarily disabling knowledge graph features.",
      },
    },
    tip: {
      prefix: "Tip:",
      content:
        "Start with Graph-Guided Retrieval for the best balance of quality and performance. Entity Extraction provides richer relationships but increases processing costs.",
    },
    toast: {
      updated: "Settings updated successfully",
      "update-failed": "Failed to update settings",
      "circuit-breaker-reset": "Circuit breaker has been reset",
      "reset-failed": "Failed to reset circuit breaker",
    },
  },
  "browser-extension-api-keys": {
    title: "Browser Extension API Keys",
    description:
      "Manage API keys for browser extensions connecting to your Octopus Studio instance.",
    "generate-new": "Generate New API Key",
    table: {
      "connection-string": "Extension Connection String",
      "created-by": "Created By",
      "created-at": "Created At",
      actions: "Actions",
    },
    "no-keys": "No API keys found",
  },
  // Observability page
  observability: {
    title: "Observability",
    description: "View system metrics and performance data",
    "time-range": "Last 7 days",
    "time-range-7d": "Last 7 days",
    "time-range-30d": "Last 30 days",
    "time-range-90d": "Last 90 days",
    metrics: {
      "total-chats": "Total Chats",
      "total-messages": "Total Messages",
      "avg-response-time": "Avg Response Time",
      "active-users": "Active Users",
      "error-rate": "Error Rate",
      "avg-tokens": "Avg Token Usage",
    },
    "knowledge-mode-distribution": "Knowledge Mode Distribution",
    loading: "Loading...",
    refresh: "Refresh",
    "no-data": "No data available",
  },
  // Billing management page
  "admin-billing": {
    title: "Billing Management",
    description:
      "Manage user wallet balances, top-up records and usage statistics.",
    "user-wallets": "User Wallets",
    "consumption-records": "Consumption Records",
    "billing-system": "Billing System",
    "enabled-desc": "Enabled - Will record token usage and deduct credits",
    "disabled-desc": "Disabled - Only logs, no deduction",
    "update-failed": "Update failed",
    table: {
      user: "User",
      plan: "Plan",
      balance: "Balance",
      "alert-threshold": "Alert Threshold",
      "created-at": "Created At",
      "total-consumed": "Total Consumed",
      "last-updated": "Last Updated",
      actions: "Actions",
      time: "Time",
      type: "Type",
      amount: "Amount",
      description: "Description",
    },
    stats: {
      "total-topup": "Total Top-up",
      "avg-topup": "Avg Top-up",
      "max-topup": "Max Top-up",
      credits: "credits",
      "topup-count": "top-ups",
      "per-topup": "per top-up",
      "single-max": "single max",
    },
    "adjust-balance": "Adjust Balance",
    "view-records": "View Records",
    loading: "Loading...",
    "no-users": "No users found",
    "no-wallets": "No user wallet data",
    "no-records": "No consumption records",
  },
  // AI System page
  "ai-system": {
    title: "AI System",
    description:
      "Monitor and configure LLM Provider, cache strategy and tool call statistics",
    loading: "Loading...",
    refresh: "Refresh",
    "fetch-error": "Failed to fetch AI system status",
    "settings-updated": "Settings updated",
    "update-failed": "Update failed",
    "provider-status": "Provider Status",
    "model-info": "Model Info",
    "connection-status": "Connection Status",
    connected: "Connected",
    disconnected: "Disconnected",
    "last-check": "Last Check",
  },

  // Page Definitions
  login: {
    "multi-user": {
      welcome: "Welcome to",
      tagline: "Where your AI team comes to work",
      "placeholder-username": "Username",
      "placeholder-password": "Password",
      login: "Login",
      validating: "Validating...",
      "forgot-pass": "Forgot password",
      reset: "Reset",
    },
    "sign-in": {
      start: "Sign in to your",
      end: "account.",
    },
    "single-user": {
      description:
        "{{appName}} is currently in single-user mode. Enter the instance password to continue.",
      "password-label": "Instance password",
      "password-placeholder": "Enter instance password",
    },
    "password-reset": {
      title: "Password Reset",
      description:
        "Provide the necessary information below to reset your password.",
      "recovery-codes": "Recovery Codes",
      "recovery-code": "Recovery Code {{index}}",
      "back-to-login": "Back to Login",
    },
  },

  "main-page": {
    noWorkspaceError: "Please create a workspace before starting a chat.",
    checklist: {
      title: "Getting Started",
      tasksLeft: "tasks left",
      completed: "You're on your way to becoming an Octopus Studio expert!",
      dismiss: "close",
      tasks: {
        create_workspace: {
          title: "Create a workspace",
          description: "Create your first workspace to get started",
          action: "Create",
        },
        send_chat: {
          title: "Send a chat",
          description: "Start a conversation with your AI assistant",
          action: "Chat",
        },
        embed_document: {
          title: "Embed a document",
          description: "Add your first document to your workspace",
          action: "Embed",
        },
        setup_system_prompt: {
          title: "Set up a system prompt",
          description: "Configure your AI assistant's behavior",
          action: "Set Up",
        },
        define_slash_command: {
          title: "Define a slash command",
          description: "Create custom commands for your assistant",
          action: "Define",
        },
        visit_community: {
          title: "Visit Community Hub",
          description: "Explore community resources and templates",
          action: "Browse",
        },
      },
    },
    quickLinks: {
      title: "Quick Links",
      sendChat: "Send Chat",
      embedDocument: "Embed a Document",
      createWorkspace: "Create Workspace",
    },
    exploreMore: {
      title: "Explore more features",
      features: {
        customAgents: {
          title: "Custom AI Agents",
          description: "Build powerful AI Agents and automations with no code.",
          primaryAction: "Chat using @agent",
          secondaryAction: "Build an agent flow",
        },
        slashCommands: {
          title: "Slash Commands",
          description:
            "Save time and inject prompts using custom slash commands.",
          primaryAction: "Create a Slash Command",
          secondaryAction: "Explore on Hub",
        },
        systemPrompts: {
          title: "System Prompts",
          description:
            "Modify the system prompt to customize the AI replies of a workspace.",
          primaryAction: "Modify a System Prompt",
          secondaryAction: "Manage prompt variables",
        },
      },
    },
    announcements: {
      title: "Updates & Announcements",
    },
    resources: {
      title: "Resources",
      links: {
        docs: "Docs",
        star: "Star on Github",
      },
      keyboardShortcuts: "Keyboard Shortcuts",
    },
  },

  "new-workspace": {
    title: "New Workspace",
    placeholder: "My Workspace",
  },

  // Workspace Settings menu items
  "workspaces—settings": {
    general: "General Settings",
    chat: "Chat Settings",
    vector: "Vector Database",
    members: "Members",
    agent: "Agent Configuration",
  },

  // General Appearance
  general: {
    vector: {
      title: "Vector Count",
      description: "Total number of vectors in your vector database.",
    },
    names: {
      description: "This will only change the display name of your workspace.",
    },
    message: {
      title: "Suggested Chat Messages",
      description:
        "Customize the messages that will be suggested to your workspace users.",
      add: "Add new message",
      save: "Save Messages",
      heading: "Explain to me",
      body: "the benefits of Octopus Studio",
    },
    pfp: {
      title: "Assistant Profile Image",
      description:
        "Customize the profile image of the assistant for this workspace.",
      image: "Workspace Image",
      remove: "Remove Workspace Image",
    },
    delete: {
      title: "Delete Workspace",
      description:
        "Delete this workspace and all of its data. This will delete the workspace for all users.",
      delete: "Delete Workspace",
      deleting: "Deleting Workspace...",
      "confirm-start": "You are about to delete your entire",
      "confirm-end":
        "workspace. This will remove all vector embeddings in your vector database.\n\nThe original source files will remain untouched. This action is irreversible.",
    },
  },

  // Chat Settings
  chat: {
    llm: {
      title: "Workspace LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace. By default, it uses the system LLM provider and settings.",
      search: "Search all LLM providers",
      intro: "This sets the model used for normal conversations.",
      default_name: "System default",
      default_description: "Follow the system LLM model for this workspace.",
    },
    model: {
      title: "Workspace Chat model",
      description:
        "The specific chat model that will be used for this workspace. If empty, will use the system LLM preference.",
      wait: "-- waiting for models --",
    },
    mode: {
      title: "Chat mode",
      chat: {
        title: "Chat",
        "desc-start": "will provide answers with the LLM's general knowledge",
        and: "and",
        "desc-end": "document context that is found.",
      },
      query: {
        title: "Query",
        "desc-start": "will provide answers",
        only: "only",
        "desc-end": "if document context is found.",
      },
    },
    history: {
      title: "Chat History",
      "desc-start":
        "The number of previous chats that will be included in the response's short-term memory.",
      recommend: "Recommend 20. ",
      "desc-end":
        "Anything more than 45 is likely to lead to continuous chat failures depending on message size.",
    },
    prompt: {
      title: "System Prompt",
      description:
        "The prompt that will be used on this workspace. Define the context and instructions for the AI to generate a response. You should provide a carefully crafted prompt so the AI can generate a relevant and accurate response.",
      history: {
        title: "System Prompt History",
        clearAll: "Clear All",
        noHistory: "No system prompt history available",
        restore: "Restore",
        delete: "Delete",
        publish: "Publish to Community Hub",
        deleteConfirm: "Are you sure you want to delete this history item?",
        clearAllConfirm:
          "Are you sure you want to clear all history? This action cannot be undone.",
        expand: "Expand",
      },
    },
    refusal: {
      title: "Query mode refusal response",
      "desc-start": "When in",
      query: "query",
      "desc-end":
        "mode, you may want to return a custom refusal response when no context is found.",
      "tooltip-title": "Why am I seeing this?",
      "tooltip-description":
        "You are in query mode, which only uses information from your documents. Switch to chat mode for more flexible conversations, or click here to visit our documentation to learn more about chat modes.",
    },
    temperature: {
      title: "LLM Temperature",
      "desc-start":
        'This setting controls how "creative" your LLM responses will be.',
      "desc-end":
        "The higher the number the more creative. For some models this can lead to incoherent responses when set too high.",
      hint: "Most LLMs have various acceptable ranges of valid values. Consult your LLM provider for that information.",
    },
  },

  // Vector Database
  "vector-workspace": {
    identifier: "Vector database identifier",
    snippets: {
      title: "Max Context Snippets",
      description:
        "This setting controls the maximum amount of context snippets that will be sent to the LLM for per chat or query.",
      recommend: "Recommended: 4",
    },
    doc: {
      title: "Document similarity threshold",
      description:
        "The minimum similarity score required for a source to be considered related to the chat. The higher the number, the more similar the source must be to the chat.",
      zero: "No restriction",
      low: "Low (similarity score ≥ .25)",
      medium: "Medium (similarity score ≥ .50)",
      high: "High (similarity score ≥ .75)",
    },
    reset: {
      reset: "Reset Vector Database",
      resetting: "Clearing vectors...",
      confirm:
        "You are about to reset this workspace's vector database. This will remove all vector embeddings currently embedded.\n\nThe original source files will remain untouched. This action is irreversible.",
      error: "Workspace vector database could not be reset!",
      success: "Workspace vector database was reset!",
    },
  },

  // Agent Configuration
  agent: {
    "performance-warning":
      "Performance of LLMs that do not explicitly support tool-calling is highly dependent on the model's capabilities and accuracy. Some abilities may be limited or non-functional.",
    intro:
      "This sets the model used when chatting with @AI employees (Agent mode). Leave it on the default to follow the chat model above.",
    default_name: "Follow chat model",
    default_description:
      "Follow this workspace's chat model (or the system default) unless set here.",
    effective: {
      inherit_chat: "Currently using: {{model}} (inherited from chat model)",
      provider_default: "Currently using this provider's default model.",
      system_default: "Currently using: {{model}} (system default)",
    },
    provider: {
      title: "Workspace Agent LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace's @agent agent.",
    },
    mode: {
      chat: {
        title: "Workspace Agent Chat model",
        description:
          "The specific chat model that will be used for this workspace's @agent agent.",
      },
      title: "Workspace Agent model",
      description:
        "The specific LLM model that will be used for this workspace's @agent agent.",
      wait: "-- waiting for models --",
    },

    skill: {
      title: "System Default Skills",
      description:
        "These capabilities are implemented through built-in tools and apply to all default Agents. This set up applies to all workspaces.",
      "page-title": "System Default Skills",
      "custom-skills-title": "Custom Tools",
      "agent-flows-title": "Agent Flows",
      rag: {
        title: "RAG & long-term memory",
        description:
          'Allow the agent to leverage your local documents to answer a query or ask the agent to "remember" pieces of content for long-term memory retrieval.',
      },
      view: {
        title: "View & summarize documents",
        description:
          "Allow the agent to list and summarize the content of workspace files currently embedded.",
      },
      scrape: {
        title: "Scrape websites",
        description:
          "Allow the agent to visit and scrape the content of websites.",
      },
      generate: {
        title: "Generate charts",
        description:
          "Enable the default agent to generate various types of charts from data provided or given in chat.",
      },
      save: {
        title: "Generate & save files",
        description:
          "Enable the default agent to generate and write to files that can be saved to your computer.",
      },
      web: {
        title: "Live web search and browsing",
        "desc-start":
          "Enable your agent to search the web to answer your questions by connecting to a web-search (SERP) provider.",
        "desc-end":
          "Web search during agent sessions will not work until this is set up.",
      },
    },
  },

  // Workspace Chats
  recorded: {
    title: "Workspace Chats",
    description:
      "These are all the recorded chats and messages that have been sent by users ordered by their creation date.",
    export: "Export",
    table: {
      id: "ID",
      by: "Sent By",
      workspace: "Workspace",
      prompt: "Prompt",
      response: "Response",
      at: "Sent At",
    },
  },

  customization: {
    interface: {
      title: "UI Preferences",
      description: "Set your UI preferences for Octopus Studio.",
    },
    branding: {
      title: "Branding & Whitelabeling",
      description:
        "White-label your Octopus Studio instance with custom branding.",
    },
    chat: {
      title: "Chat",
      description: "Set your chat preferences for Octopus Studio.",
      auto_submit: {
        title: "Auto-Submit Speech Input",
        description:
          "Automatically submit speech input after a period of silence",
      },
      auto_speak: {
        title: "Auto-Speak Responses",
        description: "Automatically speak responses from the AI",
      },
      spellcheck: {
        title: "Enable Spellcheck",
        description: "Enable or disable spellcheck in the chat input field",
      },
    },
    items: {
      theme: {
        title: "Theme",
        description: "Select your preferred color theme for the application.",
      },
      "show-scrollbar": {
        title: "Show Scrollbar",
        description: "Enable or disable the scrollbar in the chat window.",
      },
      "support-email": {
        title: "Support Email",
        description:
          "Set the support email address that should be accessible by users when they need help.",
      },
      "app-name": {
        title: "Name",
        description:
          "Set a name that is displayed on the login page to all users.",
      },
      "chat-message-alignment": {
        title: "Chat Message Alignment",
        description:
          "Select the message alignment mode when using the chat interface.",
      },
      "display-language": {
        title: "Display Language",
        description:
          "Select the preferred language to render Octopus Studio's UI in - when translations are available.",
      },
      logo: {
        title: "Brand Logo",
        description: "Upload your custom logo to showcase on all pages.",
        add: "Add a custom logo",
        recommended: "Recommended size: 800 x 200",
        remove: "Remove",
        replace: "Replace",
      },
      appIcon: {
        title: "App Icon",
        description:
          "Upload a single square icon (1024×1024 PNG recommended). It drives the browser tab favicon and is used as the source for the desktop app icon.",
        add: "Add an app icon",
        recommended: "Square, ≥512px (1024 recommended)",
        remove: "Remove",
        replace: "Replace",
      },
      "welcome-messages": {
        title: "Welcome Messages",
        description:
          "Customize the welcome messages displayed to your users. Only non-admin users will see these messages.",
        new: "New",
        system: "system",
        user: "user",
        message: "message",
        assistant: "Octopus Studio Chat Assistant",
        "double-click": "Double click to edit...",
        save: "Save Messages",
      },
      "browser-appearance": {
        title: "Browser Appearance",
        description:
          "Customize the appearance of the browser tab and title when the app is open.",
        tab: {
          title: "Title",
          description:
            "Set a custom tab title when the app is open in a browser.",
        },
        favicon: {
          title: "Favicon",
          description: "Use a custom favicon for the browser tab.",
        },
      },
      "sidebar-footer": {
        title: "Sidebar Footer Items",
        description:
          "Customize the footer items displayed on the bottom of the sidebar.",
        icon: "Icon",
        link: "Link",
      },
      "render-html": {
        title: "Render HTML in chat",
        description:
          "Render HTML responses in assistant responses.\nThis can result in a much higher fidelity of response quality, but can also lead to potential security risks.",
      },
    },
  },

  // API Keys
  api: {
    title: "API Keys",
    description:
      "API keys allow the holder to programmatically access and manage this Octopus Studio instance.",
    link: "Read the API documentation",
    generate: "Generate New API Key",
    table: {
      key: "API Key",
      by: "Created By",
      created: "Created",
    },
  },

  llm: {
    title: "LLM Preference",
    description:
      "These are the credentials and settings for your preferred LLM chat & embedding provider. It is important that these keys are current and correct, or else Octopus Studio will not function properly.",
    system_default_notice:
      "This sets the system default provider. Workspaces configured separately in their own Chat Settings are not affected.",
    override_notice: {
      title: "Some workspaces use their own LLM provider",
      action: "Open each workspace's Chat Settings to change its provider.",
    },
    provider: "LLM Provider",
    providers: {
      azure_openai: {
        azure_service_endpoint: "Azure Service Endpoint",
        api_key: "API Key",
        chat_deployment_name: "Chat Deployment Name",
        chat_model_token_limit: "Chat Model Token Limit",
        model_type: "Model Type",
        default: "Default",
        reasoning: "Reasoning",
      },
    },
  },

  transcription: {
    title: "Transcription Model Preference",
    description:
      "These are the credentials and settings for your preferred transcription model provider. Its important these keys are current and correct or else media files and audio will not transcribe.",
    provider: "Transcription Provider",
    "warn-start":
      "Using the local whisper model on machines with limited RAM or CPU can stall Octopus Studio when processing media files.",
    "warn-recommend":
      "We recommend at least 2GB of RAM and upload files <10Mb.",
    "warn-end":
      "The built-in model will automatically download on the first use.",
  },

  embedding: {
    title: "Embedding Preference",
    "desc-start":
      "When using an LLM that does not natively support an embedding engine - you may need to additionally specify credentials to for embedding text.",
    "desc-end":
      "Embedding is the process of turning text into vectors. These credentials are required to turn your files and prompts into a format which Octopus Studio can use to process.",
    provider: {
      title: "Embedding Provider",
    },
  },

  text: {
    title: "Text splitting & Chunking Preferences",
    "desc-start":
      "Sometimes, you may want to change the default way that new documents are split and chunked before being inserted into your vector database.",
    "desc-end":
      "You should only modify this setting if you understand how text splitting works and it's side effects.",
    size: {
      title: "Text Chunk Size",
      description:
        "This is the maximum length of characters that can be present in a single vector.",
      recommend: "Embed model maximum length is",
    },

    overlap: {
      title: "Text Chunk Overlap",
      description:
        "This is the maximum overlap of characters that occurs during chunking between two adjacent text chunks.",
    },
  },

  // Vector Database
  vector: {
    title: "Vector Database",
    description:
      "These are the credentials and settings for how your Octopus Studio instance will function. It's important these keys are current and correct.",
    provider: {
      title: "Vector Database Provider",
      description: "There is no configuration needed for LanceDB.",
    },
  },

  // Embeddable Chat Widgets
  embeddable: {
    title: "Embeddable Chat Widgets",
    description:
      "Embeddable chat widgets are public facing chat interfaces that are tied to a single workspace. These allow you to build workspaces that then you can publish to the world.",
    create: "Create embed",
    table: {
      workspace: "Workspace",
      chats: "Sent Chats",
      active: "Active Domains",
      created: "Created",
    },
  },
  embed: {
    "new-embed": {
      workspace: {
        label: "Workspace",
        description:
          "This is the workspace your chat window will be based on. All defaults will be inherited from the workspace unless overridden by this config.",
      },
      "chat-mode": {
        label: "Allowed chat method",
        description:
          "Set how your chatbot should operate. Query means it will only respond if a document helps answer the query. Chat opens the chat to even general questions and can answer totally unrelated queries to your workspace.",
        chat: "Chat: Respond to all questions regardless of context",
        query: "Query: Only respond to chats related to documents in workspace",
      },
      domains: {
        label: "Restrict requests from domains",
        description:
          "This filter will block any requests that come from a domain other than the list below. Leaving this empty means anyone can use your embed on any site.",
      },
    },
  },

  "embed-chats": {
    title: "Embed Chat History",
    export: "Export",
    description:
      "These are all the recorded chats and messages from any embed that you have published.",
    table: {
      embed: "Embed",
      sender: "Sender",
      message: "Message",
      response: "Response",
      at: "Sent At",
    },
  },

  security: {
    title: "Security",
    multiuser: {
      title: "Multi-User Mode",
      description:
        "Set up your instance to support your team by activating Multi-User Mode.",
      enable: {
        "is-enable": "Multi-User Mode is Enabled",
        enable: "Enable Multi-User Mode",
        description:
          "By default, you will be the only admin. As an admin you will need to create accounts for all new users or admins. Do not lose your password as only an Admin user can reset passwords.",
        username: "Admin account username",
        "username-hint":
          "Use at least 2 characters: lowercase letters, numbers, periods, underscores, and hyphens only. No spaces.",
        password: "Admin account password",
      },
    },
    password: {
      title: "Password Protection",
      description:
        "Protect your Octopus Studio instance with a password. If you forget this there is no recovery method so ensure you save this password.",
      "password-label": "Instance Password",
    },
  },

  // Event Logs
  event: {
    title: "Event Logs",
    description:
      "View all actions and events happening on this instance for monitoring.",
    clear: "Clear Event Logs",
    table: {
      type: "Event Type",
      user: "User",
      occurred: "Occurred At",
    },
  },

  // Privacy & Data-Handling
  privacy: {
    title: "Privacy & Data-Handling",
    description:
      "This is your configuration for how connected third party providers and Octopus Studio handle your data.",
    llm: "LLM Selection",
    embedding: "Embedding Preference",
    vector: "Vector Database",
    anonymous: "Anonymous Telemetry Enabled",
  },

  connectors: {
    "search-placeholder": "Search data connectors",
    "no-connectors": "No data connectors found.",
    obsidian: {
      name: "Obsidian",
      description: "Import Obsidian vault in a single click.",
      vault_location: "Vault Location",
      vault_description:
        "Select your Obsidian vault folder to import all notes and their connections.",
      selected_files: "Found {{count}} markdown files",
      importing: "Importing vault...",
      import_vault: "Import Vault",
      processing_time:
        "This may take a while depending on the size of your vault.",
      vault_warning:
        "To avoid any conflicts, make sure your Obsidian vault is not currently open.",
    },
    github: {
      name: "GitHub Repo",
      description:
        "Import an entire public or private GitHub repository in a single click.",
      URL: "GitHub Repo URL",
      URL_explained: "Url of the GitHub repo you wish to collect.",
      token: "GitHub Access Token",
      optional: "optional",
      token_explained: "Access Token to prevent rate limiting.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitHub API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from.",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitHub Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitHub's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitHub account here.",
    },
    gitlab: {
      name: "GitLab Repo",
      description:
        "Import an entire public or private GitLab repository in a single click.",
      URL: "GitLab Repo URL",
      URL_explained: "URL of the GitLab repo you wish to collect.",
      token: "GitLab Access Token",
      optional: "optional",
      token_explained: "Access Token to prevent rate limiting.",
      token_description:
        "Select additional entities to fetch from the GitLab API.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitLab API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      fetch_issues: "Fetch Issues as Documents",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitLab Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitLab's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitLab account here.",
    },
    youtube: {
      name: "YouTube Transcript",
      description:
        "Import the transcription of an entire YouTube video from a link.",
      URL: "YouTube Video URL",
      URL_explained_start:
        "Enter the URL of any YouTube video to fetch its transcript. The video must have ",
      URL_explained_link: "closed captions",
      URL_explained_end: " available.",
      task_explained:
        "Once complete, the transcript will be available for embedding into workspaces in the document picker.",
      language: "Transcript Language",
      language_explained:
        "Select the language of the transcript you want to collect.",
      loading_languages: "-- loading available languages --",
    },
    "website-depth": {
      name: "Bulk Link Scraper",
      description: "Scrape a website and its sub-links up to a certain depth.",
      URL: "Website URL",
      URL_explained: "URL of the website you want to scrape.",
      depth: "Crawl Depth",
      depth_explained:
        "This is the number of child-links that the worker should follow from the origin URL.",
      max_pages: "Maximum Pages",
      max_pages_explained: "Maximum number of links to scrape.",
      task_explained:
        "Once complete, all scraped content will be available for embedding into workspaces in the document picker.",
    },
    confluence: {
      name: "Confluence",
      description: "Import an entire Confluence page in a single click.",
      deployment_type: "Confluence deployment type",
      deployment_type_explained:
        "Determine if your Confluence instance is hosted on Atlassian cloud or self-hosted.",
      base_url: "Confluence base URL",
      base_url_explained: "This is the base URL of your Confluence space.",
      space_key: "Confluence space key",
      space_key_explained:
        "This is the spaces key of your confluence instance that will be used. Usually begins with ~",
      username: "Confluence Username",
      username_explained: "Your Confluence username",
      auth_type: "Confluence Auth Type",
      auth_type_explained:
        "Select the authentication type you want to use to access your Confluence pages.",
      auth_type_username: "Username and Access Token",
      auth_type_personal: "Personal Access Token",
      token: "Confluence Access Token",
      token_explained_start:
        "You need to provide an access token for authentication. You can generate an access token",
      token_explained_link: "here",
      token_desc: "Access token for authentication",
      pat_token: "Confluence Personal Access Token",
      pat_token_explained: "Your Confluence personal access token.",
      task_explained:
        "Once complete, the page content will be available for embedding into workspaces in the document picker.",
    },

    manage: {
      documents: "Documents",
      "data-connectors": "Data Connectors",
      "desktop-only":
        "Editing these settings are only available on a desktop device. Please access this page on your desktop to continue.",
      dismiss: "Dismiss",
      editing: "Editing",
    },
    directory: {
      "my-documents": "My Documents",
      "new-folder": "New Folder",
      "search-document": "Search for document",
      "no-documents": "No Documents",
      "move-workspace": "Move to Workspace",
      name: "Name",
      "delete-confirmation":
        "Are you sure you want to delete these files and folders?\nThis will remove the files from the system and remove them from any existing workspaces automatically.\nThis action is not reversible.",
      "removing-message":
        "Removing {{count}} documents and {{folderCount}} folders. Please wait.",
      "move-success": "Successfully moved {{count}} documents.",
      date: "Date",
      type: "Type",
      no_docs: "No Documents",
      select_all: "Select All",
      deselect_all: "Deselect All",
      remove_selected: "Remove Selected",
      costs: "*One time cost for embeddings",
      save_embed: "Save and Embed",
    },
    upload: {
      "processor-offline": "Document Processor Unavailable",
      "processor-offline-desc":
        "We can't upload your files right now because the document processor is offline. Please try again later.",
      "click-upload": "Click to upload or drag and drop",
      "file-types":
        "supports text files, csv's, spreadsheets, audio files, and more!",
      "or-submit-link": "or submit a link",
      "placeholder-link": "https://example.com",
      fetching: "Fetching...",
      "fetch-website": "Fetch website",
      "privacy-notice":
        "These files will be uploaded to the document processor running on this Octopus Studio instance. These files are not sent or shared with a third party.",
    },
    pinning: {
      what_pinning: "What is document pinning?",
      pin_explained_block1:
        "When you <b>pin</b> a document in Octopus Studio we will inject the entire content of the document into your prompt window for your LLM to fully comprehend.",
      pin_explained_block2:
        "This works best with <b>large-context models</b> or small files that are critical to its knowledge-base.",
      pin_explained_block3:
        "If you are not getting the answers you desire from Octopus Studio by default then pinning is a great way to get higher quality answers in a click.",
      accept: "Okay, got it",
    },
    watching: {
      what_watching: "What does watching a document do?",
      watch_explained_block1:
        "When you <b>watch</b> a document in Octopus Studio we will <i>automatically</i> sync your document content from it's original source on regular intervals. This will automatically update the content in every workspace where this file is managed.",
      watch_explained_block2:
        "This feature currently supports online-based content and will not be available for manually uploaded documents.",
      watch_explained_block3_start:
        "You can manage what documents are watched from the ",
      watch_explained_block3_link: "File manager",
      watch_explained_block3_end: " admin view.",
      accept: "Okay, got it",
    },
  },

  chat_window: {
    welcome: "Welcome to Octopus Studio",
    suggestions: {
      intro: {
        heading: "Introduce your capabilities",
        message: "What can you help me with? Please provide examples.",
      },
      analyze: {
        heading: "Analyze a document",
        message:
          "I want to upload a document and have you summarize the key points.",
      },
      task: {
        heading: "Start a task",
        message:
          "Let's plan a new task, please ask me for the information you need first.",
      },
    },
    authorization: {
      label: "Authorization Mode",
      hitl: {
        tooltip: "HITL: High-risk operations require your confirmation",
      },
      full: {
        tooltip:
          "Full Authorization: Execute immediately (subject to policy checks & audit)",
      },
      disabled: {
        tooltip: "Available to admins only",
      },
    },
    get_started: "To get started either",
    get_started_default: "To get started",
    upload: "upload a document",
    or: "or",
    attachments_processing: "Attachments are processing. Please wait...",
    send_chat: "send a chat.",
    send_message: "Send a message",
    attach_file: "Attach a file to this chat",
    slash: "View all available slash commands for chatting.",
    agents: "View available skills for the current AI assistant.",
    text_size: "Change text size.",
    microphone: "Speak your prompt.",
    send: "Send prompt message to workspace",
    knowledge_graph: "Knowledge Graph",
    image_canvas: "Image Canvas",
    tts_speak_message: "TTS Speak message",
    copy: "Copy",
    regenerate: "Regenerate",
    regenerate_response: "Regenerate response",
    good_response: "Good response",
    more_actions: "More actions",
    hide_citations: "Hide citations",
    show_citations: "Show citations",
    pause_tts_speech_message: "Pause TTS speech of message",
    fork: "Fork",
    delete: "Delete",
    save_submit: "Save & Submit",
    cancel: "Cancel",
    edit_prompt: "Edit prompt",
    edit_response: "Edit response",
    at_agent: "@skill",
    default_agent_description: " - skills available for this workspace.",
    custom_agents_coming_soon: "More skills coming soon!",
    slash_reset: "/reset",
    preset_reset_description: "Clear your chat history and begin a new chat",
    add_new_preset: " Add New Preset",
    command: "Command",
    your_command: "your-command",
    placeholder_prompt:
      "This is the content that will be injected in front of your prompt.",
    description: "Description",
    placeholder_description: "Responds with a poem about LLMs.",
    save: "Save",
    small: "Small",
    normal: "Normal",
    large: "Large",
    bad_response: "Bad response",
    remember_message: "Remember this message",
    remembered: "Remembered",
    agent_thinking: "Agent is thinking...",
    agent_finished_thinking: "Agent has finished thinking",
    model_thinking: "Model is thinking...",
    model_finished_thinking: "Model has finished thinking",
    show_thought_chain: "Show thought chain",
    hide_thought_chain: "Hide thought chain",
    agent_process_summary: "Agent thinking & tool-use process",
    reasoning_section: "💭 Reasoning",
    reasoning_truncated: "(truncated)",
    stop_generating_response: "Stop generating response",
    stop_generating: "Stop generating",
    rating: {
      label: "Rating",
      stars: "stars",
      poor: "Poor",
      fair: "Fair",
      good: "Good",
      very_good: "Very good",
      excellent: "Excellent",
    },
    workspace_llm_manager: {
      search: "Search LLM providers",
      loading_workspace_settings: "Loading workspace settings...",
      available_models: "Available Models for {{provider}}",
      available_models_description: "Select a model to use for this workspace.",
      save: "Use this model",
      saving: "Setting model as workspace default...",
      missing_credentials: "This provider is missing credentials!",
      missing_credentials_description: "Click to set up credentials",
      target_chat: "Setting: Chat model",
      target_agent: "Setting: Agent model (used by @AI employee)",
    },
  },

  profile_settings: {
    edit_account: "Edit Account",
    profile_picture: "Profile Picture",
    remove_profile_picture: "Remove Profile Picture",
    username: "Username",
    username_description:
      "Username must only contain lowercase letters, numbers, underscores, and hyphens with no spaces",
    new_password: "New Password",
    password_description: "Password must be at least 8 characters long",
    cancel: "Cancel",
    update_account: "Update Account",
    theme: "Theme Preference",
    language: "Preferred language",
    failed_upload: "Failed to upload profile picture: {{error}}",
    upload_success: "Profile picture uploaded.",
    failed_remove: "Failed to remove profile picture: {{error}}",
    profile_updated: "Profile updated.",
    failed_update_user: "Failed to update user: {{error}}",
    account: "Account",
    support: "Support",
    signout: "Sign out",
  },

  "keyboard-shortcuts": {
    title: "Keyboard Shortcuts",
    shortcuts: {
      settings: "Open Settings",
      workspaceSettings: "Open Current Workspace Settings",
      home: "Go to Home",
      workspaces: "Manage Workspaces",
      apiKeys: "API Keys Settings",
      llmPreferences: "LLM Preferences",
      chatSettings: "Chat Settings",
      help: "Show keyboard shortcuts help",
      showLLMSelector: "Show workspace LLM Selector",
    },
  },
  community_hub: {
    publish: {
      system_prompt: {
        success_title: "Success!",
        success_description:
          "Your System Prompt has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish System Prompt",
        name_label: "Name",
        name_description: "This is the display name of your system prompt.",
        name_placeholder: "My System Prompt",
        description_label: "Description",
        description_description:
          "This is the description of your system prompt. Use this to describe the purpose of your system prompt.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your system prompt for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public system prompts are visible to everyone.",
        private_description: "Private system prompts are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        submit: "Publish to Community Hub",
        prompt_label: "Prompt",
        prompt_description:
          "This is the actual system prompt that will be used to guide the LLM.",
        prompt_placeholder: "Enter your system prompt here...",
      },
      agent_flow: {
        public_description: "Public agent flows are visible to everyone.",
        private_description: "Private agent flows are only visible to you.",
        success_title: "Success!",
        success_description:
          "Your Agent Flow has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Agent Flow",
        name_label: "Name",
        name_description: "This is the display name of your agent flow.",
        name_placeholder: "My Agent Flow",
        description_label: "Description",
        description_description:
          "This is the description of your agent flow. Use this to describe the purpose of your agent flow.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your agent flow for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        submit: "Publish to Community Hub",
        privacy_note:
          "Agent flows are always uploaded as private to protect any sensitive data. You can change the visibility in the Community Hub after publishing. Please verify your flow does not contain any sensitive or private information before publishing.",
      },
      slash_command: {
        success_title: "Success!",
        success_description:
          "Your Slash Command has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Slash Command",
        name_label: "Name",
        name_description: "This is the display name of your slash command.",
        name_placeholder: "My Slash Command",
        description_label: "Description",
        description_description:
          "This is the description of your slash command. Use this to describe the purpose of your slash command.",
        command_label: "Command",
        command_description:
          "This is the slash command that users will type to trigger this preset.",
        command_placeholder: "my-command",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your slash command for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public slash commands are visible to everyone.",
        private_description: "Private slash commands are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        prompt_label: "Prompt",
        prompt_description:
          "This is the prompt that will be used when the slash command is triggered.",
        prompt_placeholder: "Enter your prompt here...",
      },
      generic: {
        unauthenticated: {
          title: "Authentication Required",
          description:
            "You need to authenticate with the Octopus Studio Community Hub before publishing items.",
          button: "Connect to Community Hub",
        },
      },
    },
  },
  notifications: {
    title: "Notifications",
    "mark-all-read": "Mark all as read",
    "mark-read": "Mark as read",
    delete: "Delete",
    loading: "Loading...",
    empty: "No notifications",
  },
  "agent-builder": {
    "unsupported-block": {
      title: "Unsupported block type in this build: {{blockType}}",
      hint: "Original data is preserved; delete this block if you want to remove it.",
    },
  },
  badge: {
    hired: "Hired",
  },
  // Phase Task List: Agent task status translations
  agent_task: {
    task_list: "Task List",
    execution_progress: "Execution Progress",
    task_items: "Task Items",
    expand: "Expand",
    collapse: "Collapse",
    running: "Running",
    awaiting: "Awaiting",
    failed: "Failed",
    completed: "Completed",
    waiting: "Waiting",
    total_time: "Total time",
    // Status labels
    pending: "Pending",
    success: "Completed",
    error: "Failed",
    awaiting_confirmation: "Awaiting Confirmation",
    retrying: "Retrying",
    degraded: "Degraded",
    skipped: "Skipped",
    aborted: "Aborted",
    timeout: "Timeout",
  },
  // Tool names internationalization
  tool_names: {
    "web-browsing": "Web Browsing",
    "web-scraping": "Web Scraping",
    "rag-memory": "Knowledge Retrieval",
    "document-summarizer": "Document Summarizer",
    "save-file-to-browser": "Save File",
    "create-chart": "Create Chart",
    "visual-generate": "Visual Generation",
    "sql-agent": "SQL Query",
    "mcp-tool": "MCP Tool",
    // Document generation tools
    "generate-official-document": "Document Generator",
    "generate-excel-report": "Excel Report",
    "generate-pdf-document": "PDF Document",
    // PPT generation
    "ppt-outline-flow": "PPT Outline",
    "ppt-generate-flow": "PPT Generator",
    // Agent Flows
    "agent-flow": "Agent Flow",
    // Default
    unknown: "Unknown Tool",
  },
};

export default TRANSLATIONS;
