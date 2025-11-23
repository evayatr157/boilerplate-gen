const readline = require('readline');
const fs = require('fs');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envExamplePath = '.env.example';
const envPath = '.env';

fs.readFile(envExamplePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading .env.example:', err);
    return;
  }

  const lines = data.split('\n');
  const result = [];

  const askQuestion = (index) => {
    if (index === lines.length) {
      fs.writeFile(envPath, result.join('\n'), 'utf8', (err) => {
        if (err) {
          console.error('Error writing .env:', err);
          return;
        }
        console.log('Environment variables setup successfully!');
        installDependencies();
      });
      return;
    }

    const line = lines[index];
    const [key] = line.split('=');
    rl.question(`Enter value for ${key}: `, (answer) => {
      result.push(`${key}=${answer}`);
      askQuestion(index + 1);
    });
  };

  askQuestion(0);
});

const installDependencies = () => {
  const { exec } = require('child_process');
  exec('python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && prisma generate', (err, stdout, stderr) => {
    if (err) {
      console.error('Error during dependencies installation:', stderr);
      return;
    }
    console.log('Dependencies installed successfully!');
  });
};