const ajaxCall = (apiKey, prompt) => {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString(); // Add timestamp for variability
      const dynamicPrompt = `${prompt}\n\nTimestamp: ${timestamp}`; // Combine prompt with dynamic content
  
      console.log("Sending Prompt to API:", dynamicPrompt); // Log prompt before sending
  
      $.ajax({
        url: "https://api.openai.com/v1/chat/completions",
        type: "POST",
        dataType: "json",
        data: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: dynamicPrompt }],
          max_tokens: 5000,
          n: 1,
          temperature: 0.7,
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        success: function (response) {
          console.log("Full API Response Received:", response); // Debug the response
  
          if (!response || !response.choices || !response.choices[0]) {
            console.error("Unexpected API response format:", response);
            throw new Error("Unexpected API response format.");
          }
  
          resolve(response);
        },
        error: function (xhr, status, error) {
          const err = new Error(`XHR Error: ${error}`);
          err.status = xhr.status;
          err.response = xhr.responseText;
          reject(err);
        },
      });
    });
  };
  
  (async function () {
    const template = document.createElement("template");
    template.innerHTML = `
      <style>
        #root {
          display: flex;
          justify-content: center;
          align-items: center;
          font-family: Arial, sans-serif;
          color: #333;
          height: 100%;
          padding: 10px;
          text-align: center;
          box-sizing: border-box;
        }
      </style>
      <div id="root">Loading...</div>
    `;
  
    class MainWebComponent extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(template.content.cloneNode(true));
      }
  
      async post(apiKey, prompt) {
        const rootElement = this.shadowRoot.getElementById("root");
        try {
          rootElement.textContent = "Processing...";
          console.log("Received Prompt from SAC:", prompt); // Debug prompt received from SAC
  
          const response = await ajaxCall(apiKey, prompt);
  
          const text = response.choices?.[0]?.message?.content || "No valid response received.";
          rootElement.textContent = text.trim();
          return text.trim();
        } catch (error) {
          console.error("Error during API call:", error);
          let errorMessage = "Error occurred while processing the request.";
          if (error.status === 429) {
            errorMessage = "Rate limit exceeded. Please try again later.";
          } else if (error.status === 401) {
            errorMessage = "Invalid API key. Please check your credentials.";
          } else if (error.response) {
            errorMessage = `Error: ${error.response}`;
          }
          rootElement.textContent = errorMessage;
          throw error;
        }
      }
  
      connectedCallback() {
        this.shadowRoot.getElementById("root").textContent = "Custom ChatGPT Widget Ready.";
      }
    }
  
    customElements.define("custom-widget", MainWebComponent);
  })();