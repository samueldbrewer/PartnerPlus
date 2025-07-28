const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

class PurchaseAgentService {
  constructor() {
    this.apiUrl = 'http://localhost:7777';
    this.flaskProcess = null;
    this.isStarted = false;
  }

  async start() {
    if (this.isStarted) {
      console.log('Purchase Agent service already started');
      return;
    }

    try {
      // Check if service is already running
      const health = await this.checkHealth();
      if (health) {
        console.log('Purchase Agent service already running');
        this.isStarted = true;
        return;
      }
    } catch (error) {
      // Service not running, start it
      console.log('Starting Purchase Agent Flask service...');
    }

    return new Promise((resolve, reject) => {
      const agentPath = path.join(__dirname, '../manual-purchase-agent_20250513_125500_v15.6');
      
      // Set up environment variables
      const env = {
        ...process.env,
        FLASK_APP: 'app.py',
        PYTHONPATH: agentPath,
        SERPAPI_KEY: process.env.SERPAPI_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        SECRET_KEY: 'dev-secret-key',
        ENCRYPTION_KEY: 'dev-encryption-key-12345678901234567890123456789012' // 32 bytes
      };

      // Use virtual environment python
      const pythonPath = path.join(agentPath, 'venv', 'bin', 'python');
      
      // Start Flask process
      this.flaskProcess = spawn(pythonPath, ['-m', 'flask', 'run', '--host=0.0.0.0', '--port=7777'], {
        cwd: agentPath,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.flaskProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Flask:', output);
        
        if (output.includes('Running on') || output.includes('Serving Flask app')) {
          this.isStarted = true;
          setTimeout(() => resolve(), 2000); // Give it time to fully start
        }
      });

      this.flaskProcess.stderr.on('data', (data) => {
        console.error('Flask Error:', data.toString());
      });

      this.flaskProcess.on('error', (error) => {
        console.error('Failed to start Flask process:', error);
        reject(error);
      });

      this.flaskProcess.on('close', (code) => {
        console.log(`Flask process exited with code ${code}`);
        this.isStarted = false;
      });

      // Timeout if service doesn't start
      setTimeout(() => {
        if (!this.isStarted) {
          reject(new Error('Flask service failed to start within timeout'));
        }
      }, 30000);
    });
  }

  async stop() {
    if (this.flaskProcess) {
      console.log('Stopping Purchase Agent Flask service...');
      this.flaskProcess.kill('SIGTERM');
      this.flaskProcess = null;
      this.isStarted = false;
    }
  }

  async checkHealth() {
    try {
      const response = await axios.get(`${this.apiUrl}/api/system/health`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Part Resolution Methods
  async resolvePart(description, make = null, model = null, options = {}) {
    const data = {
      description,
      make,
      model,
      use_database: options.useDatabase !== false,
      use_manual_search: options.useManualSearch !== false,
      use_web_search: options.useWebSearch !== false,
      save_results: options.saveResults !== false
    };

    try {
      const response = await axios.post(`${this.apiUrl}/api/parts/resolve`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Part resolution failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Manual Search Methods
  async searchManuals(make, model, category = null) {
    const params = { make, model };
    if (category) params.category = category;

    try {
      const response = await axios.get(`${this.apiUrl}/api/manuals/search`, { params });
      return response.data;
    } catch (error) {
      throw new Error(`Manual search failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async processManual(manualId) {
    try {
      const response = await axios.post(`${this.apiUrl}/api/manuals/${manualId}/process`);
      return response.data;
    } catch (error) {
      throw new Error(`Manual processing failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Supplier Search Methods
  async searchSuppliers(partNumber, options = {}) {
    const data = {
      part_number: partNumber,
      make: options.make,
      model: options.model,
      limit: options.limit || 5
    };

    try {
      const response = await axios.post(`${this.apiUrl}/api/suppliers/search`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Supplier search failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Service Provider Search Methods
  async searchServiceCompanies(equipmentMake, equipmentModel, options = {}) {
    const data = {
      equipment_make: equipmentMake,
      equipment_model: equipmentModel,
      service_type: options.serviceType || 'repair',
      location: options.location
    };

    try {
      const response = await axios.post(`${this.apiUrl}/api/service-providers/search`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Service company search failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Enrichment Methods
  async enrichPart(partNumber, make = null, model = null) {
    const data = { part_number: partNumber, make, model };

    try {
      const response = await axios.post(`${this.apiUrl}/api/enrichment/part`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Part enrichment failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Generic Parts Methods
  async searchGenericParts(query, options = {}) {
    const params = {
      q: query,
      limit: options.limit || 10
    };

    try {
      const response = await axios.get(`${this.apiUrl}/api/generic-parts/search`, { params });
      return response.data;
    } catch (error) {
      throw new Error(`Generic parts search failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // Screenshot Methods
  async captureScreenshot(url) {
    const data = { url };

    try {
      const response = await axios.post(`${this.apiUrl}/api/screenshots/capture`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Screenshot capture failed: ${error.response?.data?.error || error.message}`);
    }
  }
}

module.exports = PurchaseAgentService;