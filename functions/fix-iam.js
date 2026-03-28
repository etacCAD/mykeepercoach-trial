const { google } = require('googleapis');
const run = google.run('v1');

async function makePublic(serviceName) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const authClient = await auth.getClient();
  const projectId = await auth.getProjectId();
  const name = `projects/${projectId}/locations/us-central1/services/${serviceName}`;

  console.log(`Getting IAM policy for ${name}...`);
  const { data: policy } = await run.projects.locations.services.getIamPolicy({
    resource: name,
    auth: authClient
  });

  const binding = policy.bindings.find(b => b.role === 'roles/run.invoker');
  if (binding) {
    if (!binding.members.includes('allUsers')) {
      binding.members.push('allUsers');
    } else {
      console.log('Already public!');
      return;
    }
  } else {
    policy.bindings.push({
      role: 'roles/run.invoker',
      members: ['allUsers']
    });
  }

  console.log(`Setting IAM policy for ${name}...`);
  await run.projects.locations.services.setIamPolicy({
    resource: name,
    requestBody: { policy },
    auth: authClient
  });
  console.log('Success!');
}

makePublic('tedchat').catch(console.error);
makePublic('analyzev2').catch(console.error);
makePublic('reanalyzesession').catch(console.error);
