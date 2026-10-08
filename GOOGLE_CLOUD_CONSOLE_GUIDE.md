# Google Cloud Console Configuration Guide 🔑

This guide provides step-by-step instructions for configuring Google Cloud Console to enable **Gmail** and **Google Calendar** integrations in Sales AI CRM.

---

## 📋 Overview of What We Use

Sales AI CRM integrates with Google services to provide:
1. **Gmail Integration**: Syncs customer email threads, tracks replies, and enables dual-mailbox outbound sequence outreach.
2. **Google Calendar Integration**: Automatically ingests upcoming and past meetings, displays them on the `/meetings` dashboard, matches attendees to CRM Companies and Contacts, logs notes, ingests transcripts, and runs AI executive summaries.

---

## 🛠️ Step-by-Step Setup

### Step 1: Create or Select a Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top project selector dropdown, click **New Project** (or select your existing project).
3. Name your project (e.g., `Sales AI CRM` or `Radar 36`).
4. Click **Create**.

---

### Step 2: Enable Required APIs
Both **Gmail API** and **Google Calendar API** must be enabled:

1. In the left navigation menu, navigate to **APIs & Services** > **Library**.
2. Search for **Gmail API** > Click on it > Click **Enable**.
3. Go back to the **Library** search bar.
4. Search for **Google Calendar API** > Click on it > Click **Enable**.

---

### Step 3: Configure OAuth Consent Screen
1. In the left navigation menu, go to **APIs & Services** > **OAuth consent screen**.
2. Select **User Type**:
   - **Internal**: If you have a Google Workspace organization and only users within your domain will log in. (Recommended for internal teams — no verification required).
   - **External**: If using standard `@gmail.com` accounts or users outside your Google Workspace.
3. Click **Create**.
4. Fill in the **App Information**:
   - **App name**: `Sales AI CRM` (or `Radar 36`)
   - **User support email**: Select your email address.
   - **Developer contact information**: Enter your email address.
   - (Optional) App logo, homepage URL, privacy policy URL.
5. Click **Save and Continue**.
6. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Manually select or add the following scopes:
     - `.../auth/userinfo.email` (View your email address)
     - `.../auth/userinfo.profile` (See your personal info)
     - `openid`
     - `https://www.googleapis.com/auth/gmail.readonly` (Read resources from Gmail)
     - `https://www.googleapis.com/auth/gmail.send` (Send emails on your behalf)
     - `https://www.googleapis.com/auth/gmail.modify` (Read, compose, send, and modify emails)
     - `https://www.googleapis.com/auth/calendar.readonly` (See your Google calendars and events)
     - `https://www.googleapis.com/auth/calendar.events` (View and edit events on all your calendars)
   - Click **Update**.
7. Click **Save and Continue**.
8. **Test Users** *(Crucial for External apps in "Testing" mode)*:
   - If your app is set to **External** and publishing status is **Testing**, Google restricts OAuth to registered test accounts.
   - Click **+ Add Users** and enter the Gmail / Google Workspace email addresses that will connect to the CRM.
   - Click **Add**, then click **Save and Continue**.
9. Click **Back to Dashboard**.

---

### Step 4: Create OAuth 2.0 Credentials
1. In the left navigation menu, go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top > Select **OAuth client ID**.
3. Set **Application type** to: **Web application**.
4. Set **Name** to: `Sales AI CRM Web Client`.
5. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   - For Production: `https://domain.tech`
   - For Local Dev: `http://localhost:4200`
6. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   - For Production:
     ```
     https://domain.tech/api/v1/integrations/gmail/callback/
     ```
   - For Local Dev:
     ```
     http://localhost:8000/api/v1/integrations/gmail/callback/
     ```
   > ⚠️ **Important Note on Redirect URI**: The URL must match **exactly**, including `https://` vs `http://`, the port number, domain, and the **trailing slash** (`/`).
7. Click **Create**.
8. A modal will display your **Client ID** and **Client Secret**:
   - Copy both values or click **Download JSON** for safekeeping.

---

### Step 5: Connect in Sales AI CRM Settings
1. Open your CRM browser app (e.g. `https://domain.tech`).
2. Go to **Settings** > **Google Configuration** (or navigate to **Integrations** from the sidebar).
3. In the Google OAuth Configuration card:
   - Enter your **Client ID**.
   - Enter your **Client Secret**.
   - Verify the **Redirect URI** matches what was configured in Google Cloud Console (`https://domain.tech/api/v1/integrations/gmail/callback/`).
   - Click **Save Settings**.
4. Click **Connect Google Account**:
   - You will be redirected to Google's consent screen.
   - Select your Google account and grant the requested permissions.
   - Once approved, you will be redirected back to the CRM with your account connected!

---

### Step 6: Verify Meetings & Calendar Sync
1. Navigate to **Meetings** (`/meetings`) in the left navigation sidebar.
2. Click **Sync Calendar Now**:
   - Upcoming and recent meetings will sync instantly from your Google Calendar.
   - Attendee email addresses will automatically match to CRM Contacts and Companies.
   - You can edit associations or click **Add Notes & AI** to ingest transcripts and generate AI post-meeting intelligence!

---

## 🔍 Troubleshooting & FAQs

### 1. `redirect_uri_mismatch` Error
- **Cause**: The redirect URI registered in Google Cloud Console does not match the URL requested by the backend.
- **Fix**: Check the exact URL shown in Google's error screen under "Request details". Ensure that:
  - Protocol is correct (`https://` in production, `http://` in local).
  - Port is included if testing locally (`:8000`).
  - There is a trailing slash at the end: `/api/v1/integrations/gmail/callback/`.

### 2. "Access blocked: Sales AI CRM has not completed the Google verification process" / Error 403: `access_denied`
- **Cause**: The OAuth consent screen is set to **External** with status **Testing**, and the email logging in was not added as a test user.
- **Fix**:
  1. Go to **APIs & Services** > **OAuth consent screen** in Google Cloud Console.
  2. Scroll down to **Test users**.
  3. Click **+ Add Users** and add your Google account email.
  4. Try connecting again.

### 3. "Tokens Expire Every 7 Days"
- **Cause**: Google expires refresh tokens after 7 days for External apps with **Testing** publishing status.
- **Fix**:
  - If using Google Workspace, switch your consent screen to **Internal** (tokens will not expire).
  - If using personal `@gmail.com`, you can submit the consent screen to **In Production** (unverified external apps can still be used by clicking "Advanced > Go to app (unsafe)").

### 4. Calendar Events Not Showing Up
- **Check**:
  - Ensure the **Google Calendar API** is enabled in Google Cloud Console.
  - Ensure your connected Google user granted the Calendar permissions when approving the OAuth prompt. If you previously connected only Gmail before enabling Calendar, click **Disconnect Account** and re-connect to grant the new Calendar scopes.
