import { describe, it, expect } from "vitest";
import {
  zonedDateTimeToUtc,
  utcSql,
  parseEmailList,
  sanitizeAudience,
  campaignType,
  campaignDate,
} from "./campaignWorkspace";
import {
  compileDesignToHtml,
  compileDesignToText,
  normalizeDesignDocument,
} from "./emailDesignCompile";
import { sanitizeCampaignHtml } from "../server/emailHtmlSanitizer";
import { contactMatchesSmartList } from "../server/emailAudienceService";
describe("campaign workspace", () => {
  it("converts wall times independently of the server timezone", () => {
    expect(
      utcSql(zonedDateTimeToUtc("2030-01-01T10:30", "Africa/Lusaka")),
    ).toBe("2030-01-01 08:30:00");
    expect(
      utcSql(zonedDateTimeToUtc("2030-07-01T10:30", "America/New_York")),
    ).toBe("2030-07-01 14:30:00");
    expect(() =>
      zonedDateTimeToUtc("2027-03-14T02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      zonedDateTimeToUtc("2027-11-07T01:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      zonedDateTimeToUtc("2030-01-01T10:00", "Unknown/Zone"),
    ).toThrow();
  });
  it("formats SQL UTC and offset dates consistently", () => {
    expect(campaignDate("2030-01-01 08:30:00")).toBe(
      campaignDate("2030-01-01T10:30:00+02:00"),
    );
  });
  it("validates type and audience instead of silently accepting unsupported sources", () => {
    expect(campaignType("regular")).toBe("regular");
    expect(() => campaignType("event_invitation")).toThrow();
    expect(() =>
      sanitizeAudience({ version: 2, include: [{ source: "arbitrary_sql" }] }),
    ).toThrow();
    expect(parseEmailList("ADA@example.com, ada@example.com")).toEqual([
      "ada@example.com",
    ]);
    expect(() => parseEmailList("ada@example.com, invalid")).toThrow();
  });
  it("supports empty designs, nested layouts, rich text and explicit empty speaker selections", () => {
    expect(normalizeDesignDocument({ blocks: [] }).blocks).toEqual([]);
    const design = {
      blocks: [
        {
          type: "columns",
          column_widths: [30, 70],
          column_blocks: [
            [
              {
                type: "text",
                html: "<p><strong>Hello {{first_name}}</strong></p>",
              },
            ],
            [{ type: "speakers", selection_set: true, selected_ids: [] }],
          ],
        },
      ],
    };
    const html = compileDesignToHtml(design, {
      first_name: "Ada",
      speakers: [{ id: "one", name: "Hidden Speaker" }],
    });
    expect(html).toContain("Hello Ada");
    expect(html).toContain('width="30%"');
    expect(html).not.toContain("Hidden Speaker");
    expect(compileDesignToText(design, { first_name: "Ada" })).toContain(
      "Hello Ada",
    );
  });
  it("uses configured article styles and resolvable survey paths", () => {
    const html = compileDesignToHtml(
      {
        styles: { articleTitleColor: "#123456", articleTextSize: 18 },
        blocks: [
          {
            type: "article",
            label: "News",
            text: "Update",
            url: "https://example.com",
          },
          { type: "survey", survey_id: "survey-1" },
        ],
      },
      { app_url: "https://example.com" },
    );
    expect(html).toContain("color:#123456");
    expect(html).toContain("font-size:18px");
    expect(html).toContain("/email/surveys/survey-1");
  });
  it("strips active HTML, unsafe CSS and unsafe image sources while keeping responsive email styles", () => {
    const html = sanitizeCampaignHtml(
      '<html><head><style>@media(max-width:600px){.email-column{display:block}}</style></head><body><script>alert(1)</script><img src="file:///secret"><a href="javascript:alert(1)">Link</a><div style="background:url(file:///secret)">Hello</div></body></html>',
      { document: true },
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("file:");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("url(");
    expect(html).toContain("@media");
    expect(sanitizeCampaignHtml('<div style="background-image:url(https://example.com/banner.png)">Hello</div>')).toContain('url(https://example.com/banner.png)');
  });
  it("interprets smart-list boolean filter inputs correctly", () => {
    expect(
      contactMatchesSmartList(
        { active_member: 1, marketing_opt_in: 0 },
        { active_member: "1", marketing_opt_in: "0" },
      ),
    ).toBe(true);
    expect(
      contactMatchesSmartList({ active_member: 0 }, { active_member: "true" }),
    ).toBe(false);
  });
  it("preserves legacy visual-canvas content and inline styles instead of substituting defaults", () => {
    const design = {
      grapes: {
        pages: [
          {
            frames: [
              {
                component: {
                  type: "wrapper",
                  components: [
                    {
                      tagName: "table",
                      attributes: { id: "table1" },
                      components: [
                        {
                          tagName: "tr",
                          components: [
                            {
                              tagName: "td",
                              attributes: { width: "30%" },
                              components: [
                                {
                                  tagName: "p",
                                  content: "Left {{first_name}}",
                                },
                              ],
                            },
                            {
                              tagName: "td",
                              attributes: { width: "70%" },
                              components: [
                                {
                                  tagName: "strong",
                                  content: "Original right content",
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        styles: [
          { selectors: ["#table1"], style: { "background-color": "#123456" } },
        ],
      },
      blocks: [{ type: "text", text: "Incorrect fallback" }],
    };
    const html = compileDesignToHtml(design, { first_name: "Ada" });
    expect(html).toContain("Left Ada");
    expect(html).toContain("Original right content");
    expect(html).toContain("background-color:#123456");
    expect(html).not.toContain("Incorrect fallback");
  });
  it("adds preferences to designs where the footer element was removed", () => {
    expect(
      compileDesignToHtml(
        { blocks: [{ type: "text", text: "Hello" }] },
        {
          unsubscribe_url: "https://example.com/email/unsubscribe",
          preferences_url: "https://example.com/email/preferences",
        },
      ),
    ).toContain("Manage my subscriptions");
  });
});
