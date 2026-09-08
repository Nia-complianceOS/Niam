import type { GitHubOAuthErrorReason } from '@/types/api'

/**
 * Plain English for every way connecting GitHub can fail.
 *
 * When GitHub cannot complete a connection, the backend sends the browser
 * back to /repositories?github=error&reason=<slug>. Those slugs are for
 * this file and nothing else: the person reading the screen is a
 * compliance or legal reviewer, and "exchange_failed" tells them nothing
 * they can act on. Every message below says what happened and what to do
 * next, in a sentence someone would actually say out loud.
 *
 * `title` is the heading, `message` the explanation, and `retryable` says
 * whether trying again is worth their time -- an instance with no GitHub
 * app configured will fail identically every time, and offering a retry
 * button there wastes the only thing they have.
 */
interface ConnectFailure {
  title: string
  message: string
  retryable: boolean
}

const FAILURES: Record<GitHubOAuthErrorReason, ConnectFailure> = {
  missing_code: {
    title: "GitHub didn't finish the connection",
    message:
      'The approval came back incomplete — this usually means the GitHub page was closed or reloaded partway through. Starting again should work.',
    retryable: true,
  },
  invalid_state: {
    title: 'That connection attempt had expired',
    message:
      'For safety, an approval has to be completed within a few minutes of starting it, and only once. Start again and complete it in one go.',
    retryable: true,
  },
  github_unreachable: {
    title: "We couldn't reach GitHub",
    message:
      'GitHub did not respond. It may be having an outage, or this network may be blocking it. Try again in a few minutes.',
    retryable: true,
  },
  exchange_failed: {
    title: 'GitHub declined the connection',
    message:
      'GitHub refused to complete the approval. This happens when an approval is used twice or has gone stale. Starting again should sort it.',
    retryable: true,
  },
  validation_failed: {
    title: 'The connection could not be verified',
    message:
      'GitHub approved the connection but then would not confirm the account it belongs to. Please try again.',
    retryable: true,
  },
  storage_failed: {
    title: "We couldn't save the connection securely",
    message:
      'Your approval went through at GitHub, but we were unable to store it safely on our side, so nothing was kept. Your IT contact will need to look at this before it can work.',
    retryable: false,
  },
  graph_unavailable: {
    title: 'Our system was briefly unavailable',
    message:
      'We could not record the connection because part of our service was not responding. Nothing was saved. Please try again shortly.',
    retryable: true,
  },
  oauth_not_configured: {
    title: 'GitHub sign-in is not set up on this instance',
    message:
      'Connecting with one click is not available here yet. You can still connect by pasting a personal access token below, or ask your IT contact to finish the GitHub setup.',
    retryable: false,
  },
}

const UNKNOWN: ConnectFailure = {
  title: "The connection didn't complete",
  message:
    'Something went wrong while connecting your GitHub account, and nothing was saved. Please try again.',
  retryable: true,
}

/** Never returns a slug. An unrecognised reason gets the generic sentence. */
export function describeConnectFailure(reason: string | null): ConnectFailure {
  if (!reason) return UNKNOWN
  return FAILURES[reason as GitHubOAuthErrorReason] ?? UNKNOWN
}

/**
 * What a connection actually lets Niam do, in the user's terms. Shown on
 * the Connect panel so nobody is asked to approve access to their source
 * code without being told why.
 */
export const CONNECT_BENEFITS = [
  'Read the code in the repositories you choose, to find where personal data is collected and where it is sent.',
  'Check what you actually do against the DPDP Act and against your own published privacy policy.',
  'Open a pull request in your name when a policy needs amending — always as a proposal for review, never merged automatically.',
] as const

/**
 * Said plainly, because asking a non-technical reviewer to grant access to
 * private source code deserves a plain answer about the limits.
 */
export const CONNECT_ASSURANCE =
  'Only you see your repositories and findings. Nothing is written to your code without a pull request you review first, and you can disconnect at any time.'
