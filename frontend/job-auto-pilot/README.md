**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url
VITE_SWA_AUTH_PROVIDER=microsoft
VITE_SWA_MICROSOFT_PROVIDER=microsoft
VITE_SWA_EMAIL_PROVIDER=microsoft

# Backend (SWA/Functions) auth envs:
AZURE_CLIENT_ID=your_app_registration_client_id
AZURE_CLIENT_SECRET=your_app_registration_client_secret
APP_JWT_SECRET=your_long_random_secret

# Email code login (required in backend envs):
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=no-reply@yourdomain.com

# Optional for local/dev testing only:
EMAIL_LOGIN_ALLOW_NO_EMAIL=true
EMAIL_LOGIN_DEBUG_CODES=1

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
