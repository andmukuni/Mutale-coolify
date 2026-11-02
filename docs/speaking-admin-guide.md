# Managing speaking engagements

A short guide to the Speaking page at `/speaking` and its admin screens.

Everything lives in the admin sidebar under **Speaking**:

- **Speaking Engagements**: every engagement, with tabs for All, Published, Drafts and Hidden.
- **Add Engagement**: a new record.
- **Enquiries**: invitations sent from the "Invite Me to Speak" form.

The page's own text, the speaker profile PDF and the portrait are edited in **Sections**, under the **Speaking** group.

Speaking engagements are kept apart from the events you organise and sell. Nothing here creates registrations, payments, receipts, certificates or attendee emails.

## Add an engagement

Open **Speaking → Add Engagement**. Only the **Event title** is required, so a record can be saved as soon as you are invited.

- **Your role**: tick every role you have at the event, for example Speaker and Panellist. The event type (conference, forum, workshop, and so on) is a separate field.
- **Dates**: enter the event's start date and, for events over several days, its end date. If the dates aren't known yet, tick **Dates to be confirmed**. The card then shows "Date to be announced", and any dates you entered are kept for later.
- **Event time zone**: choose the zone where the event happens (Africa/Lusaka is the default). It decides the day the event moves to Previous Engagements.
- **Your speaking session**: fill this in only if you know when you speak. Leave it empty rather than guessing; the page never invents a time.
- **Event website**: add the full address, starting with `https://`. With a website, the whole card becomes a link that opens in a new tab. Without one, the card is plain text and can't be clicked. The hint under the field tells you which it will be.
- **Event image or organiser logo**: use only images you are approved to publish, and describe the image in the alt-text field that appears.
- **Topics**: a few topics separated by commas, such as `Leadership, Laboratory systems`. They appear on the card and power the topic filter.
- **Recordings and resources**: after an event, add approved links to a recording, slides, photos or an article. Each appears as its own button on the card (for example "Watch recording"). They never make the card itself clickable.
- **Status**: *Your participation* (Invited, Confirmed, Declined) and *Event status* (Scheduled, Postponed, Cancelled) are labels. Changing them never publishes an engagement. The one exception keeps you safe: saving a published engagement as **Declined** takes it off the website (it becomes Hidden), and it stays off until you publish it again.
- **Featured engagement**: shows this engagement in the homepage's "Next Speaking Engagement" band while it is upcoming, confirmed and scheduled. Without a featured one, the band shows the next confirmed engagement, and with none it doesn't appear.
- **Private notes**: contacts, fees, logistics and reminders. They are never sent to the website.

Click **Save as draft**. New engagements always start as drafts.

## Publish, hide and republish

Whether an engagement is on the website is decided only by the buttons in the **Website** panel on the right of the edit screen, or the globe and eye icons in the list:

| State | On the website? | How to change it |
|---|---|---|
| Draft | No | **Publish** |
| Published | Yes | **Hide from website** |
| Hidden | No; all details are kept | **Republish** |

- Save your changes first; Publish, Hide and Duplicate wait until there are no unsaved edits.
- **Declined** engagements are never shown and can't be published.
- Hiding removes an engagement from the website straight away. It can't recall copies visitors already downloaded, or pages external search engines have already cached.

**Preview card** shows exactly how the card will look to visitors, including whether it will be clickable, without publishing anything.

**Duplicate as draft** copies an engagement (for an event that repeats each year, say) into a new draft marked "(copy)". **Delete engagement** removes it permanently after you confirm. To take something off the website but keep it, hide it instead.

## How the page arranges engagements

- **Upcoming Engagements**: published engagements that haven't ended, nearest first. An event that is on today is marked **Happening now** and listed first.
- **Dates to be announced**: published engagements marked "Dates to be confirmed".
- **Previous Engagements**: published engagements whose last day has passed in the event's own time zone, most recent first. Moving into this section never changes a draft or hidden record. An engagement still marked *Invited* keeps its "Invited" label here; mark it *Confirmed* once you have spoken.
- **Cancelled engagements**: past engagements marked Cancelled are listed under their own heading, never under "Where I've Spoken". An upcoming cancellation stays in Upcoming with its "Cancelled" label.
- **Postponed** and **Cancelled** labels show wherever the engagement appears. A cancelled engagement shows no participation label, so it never reads as a confirmed appearance.
- **Add to calendar** appears on confirmed, scheduled, upcoming engagements with known dates. The calendar entry uses your session time when you've entered it (otherwise the event's days) and says that saving it does not register the visitor.
- **Filters** by year, role and topic appear once six or more engagements are published.
- With nothing published, the page says "New speaking engagements will be announced here."

Changes appear the next time a visitor loads the page.

## Speaking enquiries

When someone sends the "Invite Me to Speak" form:

1. The enquiry is saved under **Speaking → Enquiries** with the status *New*.
2. An alert goes to the **Alert Email** in **Settings → Notifications**. If that is empty, it goes to the Reply-To address in **Settings → Email**.
3. The organiser receives an acknowledgement saying the enquiry was received and that availability will be confirmed separately. It never promises availability.

You can edit the wording of both emails in **Templates** ("Speaking enquiry (to admin)" and "Speaking enquiry acknowledgement").

New enquiries are counted beside **Enquiries** in the sidebar until you change their status.

Open an enquiry to:

- **Reply**: sends an email from the website's address. Answers from the organiser go to the Reply-To address. A new enquiry moves to *In review* when you reply.
- **Status** and **Private notes**: track it as *New*, *In review*, *Accepted*, *Declined* or *Archived*. Click **Save**.
- **Create draft engagement**: copies the enquiry into a new draft, marked *Invited*, with the organiser's contact details in its private notes. Nothing is confirmed or published until you do it yourself.
- **Delete**: removes the enquiry permanently after you confirm.

An enquiry never becomes a public engagement on its own, and enquirers are never added to mailing lists.

## Page text, speaker profile and portrait

In **Sections**, open the **Speaking** group:

- **Introduction banner**: eyebrow, heading, supporting text and button labels.
  - **Speaker profile (PDF)**: the "Download Speaker Profile" button appears only once a PDF has been uploaded here (7 MB at most). When you replace or remove it and save, the old file is deleted from the server.
  - **Portrait**: the homepage's approved photo is used until you upload another. It shows beside the banner text on large screens, and is left out on phones so the listings stay near the top.
  - **Quote beside the portrait**: stays hidden until you add it. Use only approved wording.
- **Speaking formats**: one line per format, written as `Title | short description`. These describe how you contribute and are not links. The strip can be switched off.
- **Engagement listings**: the section headings (including the heading for past cancellations) and the empty-page message.
- **Closing invitation**: the band near the bottom of the page. It can be switched off.
- **Enquiry form**: the heading, introduction and the message shown after sending. Don't promise availability there.

## Activity counts

The top of **Speaking Engagements** shows, for the last 30 days and in total:

- enquiries received;
- speaker profile downloads;
- event-website clicks (also shown per engagement in the list).

Downloads and clicks are counted only for visitors who accept analytics cookies, and only as daily totals: no IP address or anything else that identifies a visitor is stored. The real numbers are therefore higher than shown. The Cookie Policy describes this, and visitors are asked for their cookie choice again because of it.

## Homepage band

**Sections → Home → Next speaking engagement** holds the band's wording and its on/off switch.

## Who can do what

These permissions are set in **Access control**:

| Permission | Allows |
|---|---|
| View speaking engagements | Seeing the list and previews |
| Manage speaking engagements | Adding, editing, publishing, hiding, duplicating and deleting; creating a draft from an enquiry |
| Handle speaking enquiries | Reading, replying to, updating and deleting enquiries |
| Manage website pages | Editing the Speaking page text and uploading the speaker profile in Sections |

The **Content Manager** role includes the three speaking permissions. **Super Admin** has everything.
