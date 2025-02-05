// src/providers/depinData.ts
import {
  elizaLogger
} from "@elizaos/core";
import NodeCache from "node-cache";
import * as path from "node:path";
var DEPIN_METRICS_URL = "https://gateway1.iotex.io/depinscan/explorer?is_latest=true";
var DEPIN_PROJECTS_URL = "https://metrics-api.w3bstream.com/project";
var DePINScanProvider = class {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.cache = new NodeCache({ stdTTL: 3600 });
  }
  cache;
  cacheKey = "depin/metrics";
  async readFromCache(key) {
    const cached = await this.cacheManager.get(
      path.join(this.cacheKey, key)
    );
    return cached;
  }
  async writeToCache(key, data) {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + 15 * 60 * 1e3
      // 15 minutes
    });
  }
  async getCachedData(key) {
    const cachedData = this.cache.get(key);
    if (cachedData) {
      return cachedData;
    }
    const fileCachedData = await this.readFromCache(key);
    if (fileCachedData) {
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }
    return null;
  }
  async setCachedData(cacheKey, data) {
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }
  async fetchDepinscanMetrics() {
    const res = await fetch(DEPIN_METRICS_URL);
    return res.json();
  }
  async fetchDepinscanProjects() {
    const res = await fetch(DEPIN_PROJECTS_URL);
    return res.json();
  }
  async getDailyMetrics() {
    const cacheKey = "depinscanDailyMetrics";
    const cachedData = await this.getCachedData(cacheKey);
    if (cachedData) {
      console.log("Returning cached DePINScan daily metrics");
      return cachedData;
    }
    const metrics = await this.fetchDepinscanMetrics();
    this.setCachedData(cacheKey, metrics);
    console.log("DePIN daily metrics cached");
    return metrics;
  }
  abbreviateNumber = (value) => {
    if (value === void 0 || value === null) return "";
    let num;
    if (typeof value === "bigint") {
      num = Number(value);
    } else if (typeof value === "number") {
      num = value;
    } else if (typeof value === "string") {
      num = Number.parseFloat(value);
    } else {
      return "";
    }
    if (Number.isNaN(num)) return value.toString();
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toString();
  };
  parseProjects(projects) {
    const schema = [
      "project_name",
      "slug",
      "token",
      "layer_1",
      "categories",
      "market_cap",
      "token_price",
      "total_devices",
      "avg_device_cost",
      "days_to_breakeven",
      "estimated_daily_earnings",
      "chainid",
      "coingecko_id",
      "fully_diluted_valuation"
    ];
    const parsedProjects = projects.map((project) => {
      const {
        project_name,
        slug,
        token,
        layer_1,
        categories,
        market_cap,
        token_price,
        total_devices,
        avg_device_cost,
        days_to_breakeven,
        estimated_daily_earnings,
        chainid,
        coingecko_id,
        fully_diluted_valuation
      } = project;
      return [
        project_name,
        slug,
        token,
        layer_1 ? layer_1.join(", ") : "",
        // Flatten array for compact representation
        categories ? categories.join(", ") : "",
        // Flatten array for compact representation
        this.abbreviateNumber(market_cap?.toString()),
        token_price?.toString(),
        total_devices?.toString(),
        avg_device_cost?.toString(),
        days_to_breakeven?.toString(),
        estimated_daily_earnings?.toString(),
        chainid?.toString(),
        coingecko_id?.toString(),
        this.abbreviateNumber(fully_diluted_valuation?.toString())
      ];
    });
    parsedProjects.unshift(schema);
    return parsedProjects;
  }
  async getProjects() {
    const cacheKey = "depinscanProjects";
    const cachedData = await this.getCachedData(cacheKey);
    if (cachedData) {
      console.log("Returning cached DePINScan projects");
      return cachedData;
    }
    const projects = await this.fetchDepinscanProjects();
    const parsedProjects = this.parseProjects(projects);
    this.setCachedData(cacheKey, parsedProjects);
    console.log("DePINScan projects cached");
    return parsedProjects;
  }
};
var depinDataProvider = {
  async get(runtime, _message, _state) {
    try {
      const depinscan = new DePINScanProvider(runtime.cacheManager);
      const depinscanMetrics = await depinscan.getDailyMetrics();
      const depinscanProjects = await depinscan.getProjects();
      return `
                #### **DePINScan Daily Metrics**
                ${depinscanMetrics}
                #### **DePINScan Projects**
                ${depinscanProjects}
            `;
    } catch (error) {
      elizaLogger.error("Error in DePIN data provider:", error);
      return null;
    }
  }
};

// src/actions/depinProjects.ts
import {
  composeContext,
  generateText,
  ModelClass
} from "@elizaos/core";

// src/template/index.ts
var projectsTemplate = `
You are an AI assistant with access to data about various blockchain and DePIN (Decentralized Physical Infrastructure Network) projects. Your primary task is to answer user questions about token prices and other project-related information accurately and precisely. Here's the data you have access to:
About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

{{providers}}

When a user asks a question, follow these steps:

1. Analyze the user's question carefully.
2. Search the provided projects data for relevant information.
3. If the question is about token prices, provide the most up-to-date price information available in the data.
4. If the question is about other project details (e.g., market cap, description, categories), provide that information accurately.
5. If the question cannot be answered using the available data, politely inform the user that you don't have that information.

When responding to the user:
1. Provide a clear and concise answer to the user's question.
2. If you're stating a token price or numerical value, include the exact figure from the data.
3. If relevant, provide brief additional context or information that might be helpful.

Remember to be precise, especially when discussing token prices or other numerical data. Do not speculate or provide information that is not present in the given data.

Now, please answer the user question, based on some recent messages:

{{recentMessages}}
`;

// src/actions/depinProjects.ts
var depinProjects = {
  name: "DEPIN_PROJECTS",
  similes: [
    "DEPIN_TOKENS",
    "DEPIN_DATA",
    "DEPIN_STATS",
    "DEPIN_ANALYTICS",
    "PROJECT_TOKENS",
    "PROJECT_STATS",
    "PROJECT_DATA",
    "TOKEN_PROJECTS",
    "CHAIN_PROJECTS",
    "BLOCKCHAIN_PROJECTS",
    "PROJECT_ANALYTICS",
    "PROJECT_DETAILS"
  ],
  description: "Analyzes DePINScan projects",
  validate: async (_runtime) => {
    return true;
  },
  examples: [
    [
      {
        user: "user",
        content: {
          text: "What is the token price of Render?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "The current token price of Render (RNDR) is $9.02.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Which token has a higher price: Helium or Render?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Helium (HNT) is priced at $3.21, which is lower than Render (RNDR) at $9.02.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Can you give me the prices of all available tokens?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Sure! Solana (SOL) is $221.91, Render (RNDR) is $9.02, and Helium (HNT) is $3.21.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Which token costs more than $200?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "The only token priced above $200 is Solana (SOL) at $221.91.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What is the market cap of Render?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "The market cap of Render (RNDR) is $4,659,773,671.85.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Can you give me the categories for Solana?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Solana (SOL) belongs to the following categories: Chain.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What is the fully diluted valuation of Helium?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "The fully diluted valuation of Helium (HNT) is $450,000,000.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What are the projects running on Solana?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "The projects running on Solana include Render and Helium.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What is the token price of an unlisted project?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "I'm sorry, but I don't have information on the token price for the specified project.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What is the launch date of Solana?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "I'm sorry, but I don't have information on the launch date of Solana.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Can you tell me the founder of Render?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "I currently don't have information on the founder of Render.",
          action: "DEPIN_TOKENS"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Do you have the total supply for Helium?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "I'm sorry, but I don't have data on the total supply of Helium.",
          action: "DEPIN_TOKENS"
        }
      }
    ]
  ],
  handler: async (runtime, message, state, _options, callback) => {
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    const projectsContext = composeContext({
      state: currentState,
      template: projectsTemplate
    });
    try {
      const text = await generateText({
        runtime,
        context: projectsContext,
        modelClass: ModelClass.LARGE
      });
      if (callback) {
        callback({
          text,
          inReplyTo: message.id
        });
      }
      return true;
    } catch (error) {
      console.error("Error in depin project plugin:", error);
      if (callback) {
        callback({
          text: "Error processing request, try again",
          content: { error: error.message }
        });
      }
      return false;
    }
  }
};

// src/actions/sentientai.ts
var sentientAI = {
  name: "SENTIENT_AI",
  similes: [
    "SENTIENT",
    "NEWS",
    "WEATHER"
  ],
  description: "Provide realtime information for Weather, News.",
  examples: [
    [
      {
        user: "user",
        content: {
          text: "What's the weather forecast for Tokyo?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Here's the weather forecast for Tokyo: Tomorrow will be 22\xB0C with partly cloudy skies. The next few days will see temperatures ranging from 18-24\xB0C with a chance of rain on Thursday.",
          action: "WEATHER"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "Will it rain in London this week?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Looking at London's forecast: There's a 60% chance of rain on Wednesday with temperatures around 15\xB0C. The rest of the week should be mostly cloudy with occasional showers.",
          action: "WEATHER"
        }
      }
    ],
    [
      {
        user: "user",
        content: {
          text: "What is the latest news about Trump?"
        }
      },
      {
        user: "assistant",
        content: {
          text: "Here are some of the latest news articles related to Trump: Trump invites House Republicans to Mar-a-Lago for strategy meetings.",
          action: "NEWS"
        }
      }
    ]
  ],
  validate: async (_runtime, _message) => {
    return true;
  },
  handler: async (runtime, message, _state, _options, callback) => {
    try {
      const content = message.content;
      const response = await fetch("https://quicksilver.iotex.ai/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-KEY": runtime.getSetting("SENTAI_API_KEY")
        },
        body: JSON.stringify({
          q: content.text
        })
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      const res = await response.json();
      callback({
        text: res.data
      });
      return true;
    } catch (error) {
      console.error("Error", error.message);
      if (callback) {
        callback({ text: `Error: ${error.message}` });
      }
      return false;
    }
  }
};

// src/index.ts
var depinPlugin = {
  name: "depin",
  description: "DePIN plugin for Sentient AI",
  providers: [depinDataProvider],
  evaluators: [],
  services: [],
  actions: [sentientAI, depinProjects]
};
var index_default = depinPlugin;
export {
  index_default as default,
  depinPlugin
};
//# sourceMappingURL=index.js.map