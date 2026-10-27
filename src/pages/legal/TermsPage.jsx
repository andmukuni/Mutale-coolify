import { Link } from 'react-router-dom';
import LegalDocument, { LegalList } from '../../components/LegalDocument';
import { LEGAL, operatorLabel } from '../../config/legal';

const link = 'font-medium text-cyan-700 underline hover:text-cyan-600';

function Contact() {
  return (
    <a href={`mailto:${LEGAL.email}`} className={link}>
      {LEGAL.email}
    </a>
  );
}

export default function TermsPage() {
  const cutoff = LEGAL.eventRefundCutoffDays;
  const reportDays = LEGAL.shopReportDays;

  const sections = [
    {
      id: 'about',
      title: 'About these terms',
      content: (
        <>
          <p>
            These terms apply when you use {LEGAL.website} (the “site”), create an account, register for an
            event or online session, buy from our shop, use our CV builder, or receive our emails. The site is
            run by {operatorLabel()} (“we”, “us”, “our”)
            {LEGAL.registrationNumber ? `, registration number ${LEGAL.registrationNumber}` : ''}
            {LEGAL.physicalAddress ? `, of ${LEGAL.physicalAddress}` : `, based in ${LEGAL.country}`}. You can
            contact us at <Contact />
            {LEGAL.phone ? ` or ${LEGAL.phone}` : ''}.
          </p>
          <p>
            By using the site or buying from us you agree to these terms. If you do not agree, please do not
            use the site. Please also read our{' '}
            <Link to="/cookie-policy" className={link}>Cookie Policy</Link>, which explains how the site uses
            cookies and browser storage.
          </p>
          <p>
            You must be 18 or older to create an account or pay on the site. Anyone younger may only use the
            site with the permission of a parent or guardian, who accepts these terms on their behalf.
          </p>
        </>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      content: (
        <p>
          We may update these terms from time to time, for example when we add a service or the law changes.
          The version on the site when you register or place an order is the one that applies to that
          registration or order. We will tell account holders by email about changes that significantly
          affect them.
        </p>
      ),
    },
    {
      id: 'accounts',
      title: 'Your account',
      content: (
        <LegalList
          items={[
            'Give accurate, up-to-date information and keep it current.',
            'Keep your password and sign-in links private. You are responsible for activity on your account; tell us straight away if you think someone else has used it.',
            'Accounts are personal. Do not share an account or create one for someone else without their permission.',
            'You can ask us to close your account at any time by contacting us.',
          ]}
        />
      ),
    },
    {
      id: 'events',
      title: 'Events and registration',
      content: (
        <>
          <LegalList
            items={[
              'A registration is confirmed only when we send you a confirmation or ticket. Some events need our approval first or put you on a waiting list; we will tell you if a place becomes available.',
              'Tickets and QR codes are personal to the person named on them. Please do not share them. If you cannot attend, contact us before the event and we may, at our discretion, transfer your place to someone else.',
              'Bring your ticket or QR code for check-in. We may refuse entry if a ticket has already been used or appears to have been copied.',
              'Programmes, speakers, times and venues are planned carefully but may change. We will tell registered attendees about significant changes as soon as we can.',
              'Please be respectful to speakers, staff and other attendees. We may ask anyone who is abusive, disruptive or unsafe to leave an event or session, without a refund.',
              'At in-person events, please follow the venue’s rules and look after your belongings. We are not responsible for items lost at a venue, except where the loss is caused by our negligence.',
            ]}
          />
          <p>
            Do not record, photograph or share sessions or presentation materials unless we say you may. If we
            plan to record a session or take photographs at an event, we will tell attendees beforehand.
          </p>
        </>
      ),
    },
    {
      id: 'online',
      title: 'Online sessions',
      content: (
        <>
          <p>
            Online sessions run on third-party video platforms such as Zoom and Daily. You need a suitable
            device and internet connection; we cannot be responsible for problems with your equipment, your
            internet service or those platforms. If a session cannot go ahead because of a problem on our
            side, we will reschedule it or give you a recording or refund where appropriate.
          </p>
          <p>Join links are personal. Please do not share them.</p>
        </>
      ),
    },
    {
      id: 'payments',
      title: 'Prices and payment',
      content: (
        <LegalList
          items={[
            'Prices are set in Zambian Kwacha (ZMW) and you are charged in Kwacha. Any taxes, delivery charges or fees are shown before you pay.',
            'If you are outside Zambia we may also show an approximate US Dollar price for convenience. It is an estimate; your bank may apply its own exchange rate and fees.',
            'Payments are processed by our payment provider, Lenco, by card or mobile money. We do not see or store your full card details.',
            'Discount codes must be used as described when they are issued, cannot be exchanged for cash and may be withdrawn if misused.',
            'If a price was shown in obvious error we may cancel the order or registration and refund you in full.',
            'A receipt is available after a successful payment.',
          ]}
        />
      ),
    },
    {
      id: 'refunds',
      title: 'Event cancellations and refunds',
      content: (
        <>
          <LegalList
            items={[
              <><strong>If we cancel an event</strong>, you can choose a full refund or a transfer to another date or event.</>,
              <><strong>If we significantly change</strong> the date, venue or format (for example from in-person to online) and you can no longer attend, tell us and we will refund you in full.</>,
              <><strong>If you cancel {cutoff} or more days before the event starts</strong>, we will refund what you paid, less any payment processing fees we cannot recover.</>,
              <><strong>If you cancel less than {cutoff} days before the event, or do not attend</strong>, we do not give refunds. You may ask us to transfer your place to someone else before the event.</>,
              'Refunds go back to the original payment method, normally within 14 working days of being approved. How long it takes to reach you depends on your bank or mobile money provider.',
              'For free events, please cancel if you can no longer attend so your place can go to someone else.',
            ]}
          />
          <p>To cancel or ask for a refund, email <Contact /> with your ticket reference.</p>
        </>
      ),
    },
    {
      id: 'shop',
      title: 'Shop orders and delivery',
      content: (
        <LegalList
          items={[
            'An order is accepted when your payment is confirmed and we send you a confirmation. If an item turns out to be unavailable we will tell you and refund you for it.',
            'We deliver to the addresses and areas offered at checkout, at the delivery charge shown. Delivery times are estimates. Please make sure someone can receive the order.',
            'Items are your responsibility once delivered to the address you gave us.',
            `If an item arrives damaged, faulty or is not what you ordered, tell us within ${reportDays} days of delivery and we will replace it or refund you, including delivery costs.`,
            `If you change your mind about a physical item, you may return it unused and in its original condition within ${reportDays} days of delivery. We will refund the item price once we receive it; return delivery costs are yours unless the item was faulty.`,
            'Digital products, such as e-books and downloads, cannot be returned once you have started downloading or accessing them, unless they are faulty.',
          ]}
        />
      ),
    },
    {
      id: 'cv-builder',
      title: 'CV builder and certificates',
      content: (
        <>
          <p>
            Our CV builder helps you produce a CV document. Where a fee applies, it is shown before you pay and
            the service is supplied when your download becomes available. You are responsible for the accuracy
            of everything you put in your CV. Suggestions from the CV builder are general guidance; we cannot
            promise any job, interview or other outcome.
          </p>
          <p>
            Certificates of attendance are issued only when the attendance requirements for that event are met.
            Each certificate can be checked on our verification page. We may cancel a certificate that was
            obtained dishonestly or issued by mistake.
          </p>
        </>
      ),
    },
    {
      id: 'assistant',
      title: 'Site assistant',
      content: (
        <p>
          The chat assistant on this site gives automated answers generated with an artificial intelligence
          service (currently provided by OpenAI), which processes the messages you type in order to reply.
          Its answers can be incomplete or wrong, so please check anything important with us. Do not enter
          passwords, payment details, health information or other sensitive personal information in the chat.
          The assistant does not give professional advice.
        </p>
      ),
    },
    {
      id: 'your-content',
      title: 'Your posts and community rules',
      content: (
        <>
          <p>
            When you post in event forums, answer surveys or send us content, you keep ownership of it and
            give us permission to store, display and use it to run our events and improve our services. Survey
            answers may be used in summary form without identifying you.
          </p>
          <p>You must not use the site to:</p>
          <LegalList
            items={[
              'post anything unlawful, defamatory, hateful, harassing, misleading or that infringes someone else’s rights;',
              'share other people’s personal information without their permission;',
              'send spam or advertising, or impersonate anyone;',
              'try to gain unauthorised access to the site, other accounts or our systems, or interfere with how the site works;',
              'copy or collect content or data from the site by automated means without our written permission.',
            ]}
          />
          <p>We may remove content that breaks these rules.</p>
        </>
      ),
    },
    {
      id: 'communications',
      title: 'Emails and messages',
      content: (
        <>
          <p>
            We send service messages by email or SMS that you need in order to use what you signed up for,
            such as confirmations, tickets, receipts, reminders and changes to an event. These are not marketing
            and you cannot opt out of them while you have an active registration or order.
          </p>
          <p>
            We only send marketing emails, such as news of future events and programmes, if you have agreed to
            receive them. You can unsubscribe at any time using the link in any marketing email or from your{' '}
            <Link to="/email/preferences" className={link}>email preferences</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'ip',
      title: 'Intellectual property',
      content: (
        <p>
          The site and its content, including text, publications, training materials, event resources, logos
          and designs, belong to us or the people who licensed them to us. You may view and download them for
          your own personal, non-commercial use. You may not copy, sell, republish or distribute them, or use
          them to train artificial intelligence systems, without our written permission.
        </p>
      ),
    },
    {
      id: 'information',
      title: 'Information on this site',
      content: (
        <p>
          Articles, publications, event content and other material on the site are for general information
          and professional development. They are not a substitute for professional, medical, laboratory,
          legal or other advice about your particular situation. We work to keep the site accurate and
          available but cannot promise it will always be error-free or uninterrupted.
        </p>
      ),
    },
    {
      id: 'third-parties',
      title: 'Services provided by other companies',
      content: (
        <p>
          Some features rely on other companies, including Lenco (payments), Zoom and Daily (online sessions),
          OpenStreetMap (maps) and OpenAI (site assistant). When you use those features their own terms and
          privacy policies also apply. Links to other websites are provided for convenience; we are not
          responsible for their content.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Our responsibility to you',
      content: (
        <>
          <p>
            Nothing in these terms limits or excludes our liability for death or personal injury caused by our
            negligence, for fraud, or for anything else that cannot be limited or excluded under the laws of
            Zambia. Nothing in these terms takes away rights you have as a consumer, including under the
            Competition and Consumer Protection Act No. 24 of 2010.
          </p>
          <p>Subject to that:</p>
          <LegalList
            items={[
              'we are responsible for loss you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care and skill;',
              'we are not responsible for loss that was not foreseeable, for business losses such as lost profits or opportunities, or for problems caused by events outside our reasonable control;',
              'our total liability to you for any claim is limited to the amount you paid us for the event, product or service the claim relates to.',
            ]}
          />
        </>
      ),
    },
    {
      id: 'suspension',
      title: 'Suspending or closing accounts',
      content: (
        <p>
          We may suspend or close an account, cancel a registration or refuse an order if we reasonably believe
          these terms have been broken, payment was fraudulent, or this is needed to protect other users or
          comply with the law. Where possible we will tell you why and give you a chance to respond. If we
          cancel something you paid for and you did nothing wrong, we will refund you.
        </p>
      ),
    },
    {
      id: 'privacy',
      title: 'Your personal information',
      content: (
        <>
          <p>
            We use the personal information you give us (such as your name, contact details, registration
            answers and payment status) to provide our events, shop and other services, to keep accounts secure
            and to meet our legal obligations. We handle it in line with the Data Protection Act No. 3 of 2021 of
            Zambia and share it only with the service providers that help us run the site, or where the law
            requires.
          </p>
          <p>
            You can ask for a copy of the personal information we hold about you, or ask us to correct or delete
            it, by emailing <Contact />. You may also complain to the Office of the Data Protection Commissioner
            of Zambia.
          </p>
        </>
      ),
    },
    {
      id: 'disputes',
      title: 'Complaints, disputes and governing law',
      content: (
        <>
          <p>
            If you have a complaint, please email <Contact /> first. We will reply within 10 working days and
            try to resolve it fairly within 30 days.
          </p>
          <p>
            These terms are governed by the laws of the Republic of Zambia. Any dispute that we cannot resolve
            together may be brought before the courts of Zambia.
          </p>
        </>
      ),
    },
    {
      id: 'general',
      title: 'General',
      content: (
        <LegalList
          items={[
            'If a court finds part of these terms unenforceable, the rest still applies.',
            'If we do not enforce a right straight away, we can still enforce it later.',
            'You may not transfer your rights under these terms without our agreement. We may transfer ours to an organisation that takes over our services, and will tell you if this affects you.',
            'These terms, together with the details shown when you register or order, are the whole agreement between us about the site.',
          ]}
        />
      ),
    },
    {
      id: 'contact',
      title: 'Contact us',
      content: (
        <p>
          {operatorLabel()} — email <Contact />
          {LEGAL.phone ? `, phone ${LEGAL.phone}` : ''}
          {LEGAL.physicalAddress ? `, ${LEGAL.physicalAddress}` : `, ${LEGAL.country}`}.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Terms and Conditions"
      summary="The rules for using this site, registering for our events, buying from our shop and using our tools."
      sections={sections}
      related={{ to: '/cookie-policy', label: 'Cookie Policy' }}
    />
  );
}
