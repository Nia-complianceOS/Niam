import type { GitHubOAuthErrorReason } from '@/types/api'

/**
 * Every reason slug the GitHub flows can produce. The callback redirect
 * (`/auth/github/complete?error=…`) and the two exchange endpoints
 * (`POST /auth/github/exchange`, `POST /github/oauth/exchange`) share
 * this vocabulary. `not_owner` is ours: the connect exchange answers 403
 * when the person finishing it is not a workspace owner.
 */
export type GitHubFlowReason =
  | GitHubOAuthErrorReason
  | 'access_denied'
  | 'expired_code'
  | 'browser_mismatch'
  | 'account_exists_link_required'
  | 'email_unverified'
  | 'account_missing'
  | 'not_owner'

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

const FAILURES: Record<GitHubFlowReason, ConnectFailure> = {
  access_denied: {
    title: 'GitHub access was not granted',
    message:
      'The request was cancelled on GitHub, so nothing was connected. If that was a mistake, start again and choose Authorize.',
    retryable: true,
  },
  expired_code: {
    title: 'That GitHub link expired',
    message:
      'That sign-in link expired or was opened in another browser. Start again.',
    retryable: true,
  },
  browser_mismatch: {
    title: 'Finished in a different browser',
    message:
      'That sign-in link expired or was opened in another browser. Start again in this browser and finish it here.',
    retryable: true,
  },
  account_exists_link_required: {
    title: 'You already have a Niam account',
    message:
      'An account with this email already exists. Sign in with your password, then connect GitHub from Repositories — that links it, and next time Continue with GitHub works.',
    retryable: false,
  },
  email_unverified: {
    title: 'Your GitHub email is not verified',
    message:
      'Verify your primary email on GitHub first (GitHub → Settings → Emails), then try Continue with GitHub again.',
    retryable: true,
  },
  account_missing: {
    title: 'That account no longer exists',
    message:
      'The Niam account linked to this GitHub login has been removed. Create a new account, or sign in with a different method.',
    retryable: false,
  },
  not_owner: {
    title: 'Only a workspace owner can connect GitHub',
    message:
      'GitHub is connected by the workspace owner. Ask them to connect it, or switch to a workspace you own.',
    retryable: false,
  },
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
  return isKnownGitHubReason(reason) ? FAILURES[reason] : UNKNOWN
}

/** True when `reason` is one of the slugs above (not free-form text). */
export function isKnownGitHubReason(reason: string | null | undefined): reason is GitHubFlowReason {
  return !!reason && Object.prototype.hasOwnProperty.call(FAILURES, reason)
}

const SIGNIN_UNKNOWN: ConnectFailure = {
  title: "Sign-in with GitHub didn't complete",
  message: 'Something went wrong while signing you in with GitHub. Please start again.',
  retryable: true,
}

/**
 * The same failures, worded for signing in rather than connecting. Only
 * the few whose connect wording would mislead are overridden.
 */
const SIGNIN_OVERRIDES: Partial<Record<GitHubFlowReason, ConnectFailure>> = {
  access_denied: {
    title: 'GitHub access was not granted',
    message:
      'The request was cancelled on GitHub, so nothing changed. If that was a mistake, start again and choose Authorize.',
    retryable: true,
  },
  invalid_state: {
    title: 'That sign-in link expired',
    message: 'That sign-in link expired or was opened in another browser. Start again.',
    retryable: true,
  },
  missing_code: {
    title: "GitHub didn't finish signing you in",
    message: 'The GitHub page was closed or reloaded partway through. Start again.',
    retryable: true,
  },
  oauth_not_configured: {
    title: 'GitHub sign-in is not set up on this instance',
    message: 'Sign in with your email and password instead, or ask your IT contact to finish the GitHub setup.',
    retryable: false,
  },
  exchange_failed: {
    title: 'GitHub declined the sign-in',
    message: 'GitHub refused to complete the approval, usually because it was used twice or went stale. Start again.',
    retryable: true,
  },
  storage_failed: {
    title: "We couldn't finish signing you in",
    message: 'Our side could not record the sign-in, so nothing was changed. Try again shortly, or sign in with your password.',
    retryable: true,
  },
  graph_unavailable: {
    title: 'Our system was briefly unavailable',
    message: 'Nothing was changed. Please try again shortly.',
    retryable: true,
  },
  validation_failed: {
    title: 'GitHub would not confirm your account',
    message: 'GitHub approved the request but would not confirm which account it belongs to. Please try again.',
    retryable: true,
  },
}

/** Like describeConnectFailure, for the sign-in flow. */
export function describeSignInFailure(reason: string | null): ConnectFailure {
  if (!isKnownGitHubReason(reason)) return SIGNIN_UNKNOWN
  return SIGNIN_OVERRIDES[reason] ?? FAILURES[reason]
}

/**
 * What a connection actually lets Niam do, in the user's terms. Shown on
 * the Connect panel so nobody is asked to approve access to their source
 * code without being told why.
 */
export const CONNECT_BENEFITS = [
  'Read the code of the repositories you choose to scan, to find where personal data is collected and where it is sent. GitHub grants this through the `repo` scope, which it describes as full read and write access to your repositories; write access is what lets Niam open a remediation pull request.',
  'Check what you actually do against the DPDP Act and against your own published privacy policy.',
  'Open a pull request in your name when a policy needs amending — always as a proposal for review, never merged automatically.',
] as const

/**
 * Said plainly, because asking a non-technical reviewer to grant access to
 * private source code deserves a plain answer about the limits.
 */
export const CONNECT_ASSURANCE =
  'Only members of this workspace see its repositories and findings. Nothing is written to your code without a pull request you review first, and you can disconnect at any time.'
