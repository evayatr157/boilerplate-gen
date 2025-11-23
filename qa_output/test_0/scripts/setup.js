const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envExamplePath = '.env.example';
const envPath = '.env';

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

(async function setup() {
  console.log('Welcome to the setup script!');

  if (!fs.existsSync(envExamplePath)) {
    console.log(`Cannot find \\`.env.example\\` at path: ${envExamplePath}`);
    process.exit(1);
  }

  const envExample = fs.readFileSync(envExamplePath, { encoding: 'utf8' });
  const lines = envExample.split('\n').filter(line => line.trim() !== '');

  const values = {};
  for (const line of lines) {
    const key = line.split('=')[0];
    const value = await askQuestion(`Enter value for ${key}: `);
    values[key] = value;
  }

  const newEnvContent = lines.map(line => {
    const key = line.split('=')[0];
    return `${key}=${values[key]}`;
  }).join('\n');

  fs.writeFileSync(envPath, newEnvContent);

  console.log('.env file created successfully!');

  try {
    console.log('Installing dependencies...');
    const execSync = require('child_process').execSync;
    execSync('npm install', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error during npm install:', error);
  }
  rl.close();
})();