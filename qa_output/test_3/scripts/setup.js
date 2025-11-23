const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envExamplePath = '.env.example';
const envPath = '.env';

console.log('Welcome to the setup script!');

const createEnvFile = (exampleContent) => {
  const keys = exampleContent.match(/^.*(?==)/gm);
  const envContent = keys.map(key => `Please enter value for ${key}: `).join('\n');

  const envValues = {};
  let index = 0;

  const askForEnvValue = () => {
    if (index < keys.length) {
      const key = keys[index];
      rl.question(envContent.split('\n')[index], (answer) => {
        envValues[key] = answer;
        index++;
        askForEnvValue();
      });
    } else {
      const finalEnv = Object.entries(envValues).map(([key, val]) => `${key}=${val}`).join('\n');
      fs.writeFileSync(envPath, finalEnv);
      console.log('Environment setup complete.');
      installDependencies();
      rl.close();
    }
  };
  askForEnvValue();
};

const installDependencies = () => {
  try {
    const execSync = require('child_process').execSync;
    execSync('pip install -r requirements.txt');
    console.log('Dependencies installed successfully.');
  } catch (err) {
    console.error('Failed to install dependencies:', err);
  }
};

fs.readFile(envExamplePath, 'utf8', (err, data) => {
  if (err) {
    console.error('An error occurred:', err);
    rl.close();
  } else {
    createEnvFile(data);
  }
});