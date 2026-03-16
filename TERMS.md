# Terms of Service

**Stacker** (`stacked-cli`)
Last updated: March 2025

---

## 1. What Is This Service?

Stacker is a free, open-source command-line tool that analyzes software repositories and provides AI-powered stack improvement recommendations. The CLI itself is MIT-licensed and freely available on npm.

To deliver AI analysis, Stacker routes requests through a proxy server (`stacker-proxy.ptgeneral.workers.dev`) operated by ptgeneral. Use of this proxy is subject to these terms.

---

## 2. Acceptance

By running `stacker analyze` or any command that contacts the proxy, you agree to these terms. If you do not agree, you may use Stacker in offline/rule-only mode or self-host the proxy.

---

## 3. Acceptable Use

You may use Stacker to analyze repositories you own or have permission to analyze.

You may **not**:

- Abuse the proxy with automated requests beyond normal CLI usage
- Attempt to scrape, harvest, or systematically extract data from the proxy
- Use Stacker to analyze repositories you do not have permission to access
- Attempt to reverse-engineer, bypass, or tamper with the proxy's authentication or rate limiting
- Use scripts or bots to issue requests in bulk
- Resell access to the proxy or build commercial products on top of the free proxy without prior agreement

---

## 4. Rate Limits

The proxy enforces a limit of **60 requests per minute per machine**. This is generous for normal CLI use (a typical analysis uses 2 requests).

Sustained traffic that significantly exceeds normal usage patterns may result in temporary or permanent access revocation.

---

## 5. Data We Collect

Stacker is designed to collect as little data as possible.

**What the proxy receives:**
- A hashed machine fingerprint (a one-way hash — your machine identity is never stored in plaintext)
- Structured metadata about your stack (framework names, version strings, file counts, rule findings)
- Your request timestamp and IP address (standard server logs)

**What the proxy never receives:**
- Your source code
- File contents
- Personal information (name, email, etc.)
- Credentials or secrets from your repository

Server logs are retained for operational and abuse-prevention purposes and are not shared with third parties.

---

## 6. No Warranty

This service is provided **as-is**, without warranty of any kind. We make no guarantees that:

- The service will be available at any given time
- Recommendations will be accurate or suitable for your use case
- The proxy will remain free indefinitely

Use Stacker's output as a starting point for your own judgment — not as professional software engineering advice.

---

## 7. Access Revocation

We reserve the right to revoke access for any machine that:

- Violates these terms
- Abuses the rate limits
- Attempts to exploit or tamper with the proxy

Revocation is typically permanent for intentional abuse and temporary for accidental limit violations.

---

## 8. Service Availability

The proxy is operated on a **best-effort basis**. We do not provide an uptime guarantee or SLA. The service may be unavailable for maintenance, updates, or unexpected outages.

If the proxy is unavailable, Stacker's rule-based analysis continues to work locally without any network requests.

---

## 9. Changes to These Terms

We may update these terms at any time. The "Last updated" date at the top of this file will reflect any changes. Continued use of the proxy after changes constitutes acceptance of the updated terms.

---

## 10. Contact

For questions about these terms or to report abuse, contact:

**Email:** legal@ptgeneral.ai

For security vulnerabilities, see [SECURITY.md](SECURITY.md).
