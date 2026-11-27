// Shared labels for the call center screens (English keys, translated with t()).
export const OUTCOME_LABELS = {
  INTERESTED: 'Interested', SALE: 'Sale / signed up', RESOLVED: 'Resolved', CALLBACK: 'Call back later',
  NO_ANSWER: 'No answer', VOICEMAIL: 'Voicemail', NOT_INTERESTED: 'Not interested', WRONG_NUMBER: 'Wrong number', DO_NOT_CALL: 'Do not call again',
}
export const OUTCOME_TONE = {
  INTERESTED: 'good', SALE: 'good', RESOLVED: 'good', CALLBACK: 'wait', NO_ANSWER: 'wait', VOICEMAIL: 'wait',
  NOT_INTERESTED: 'bad', WRONG_NUMBER: 'bad', DO_NOT_CALL: 'bad',
}
export const STATUS_LABELS = { AVAILABLE: 'Available', ON_CALL: 'On a call', BREAK: 'On a break', OFFLINE: 'Offline' }
export const PURPOSE_LABELS = {
  MEMBERSHIP_SALES: 'Membership sales', MEMBER_SUPPORT: 'Member support', RECRUITMENT: 'Company recruitment', SURVEY: 'Survey', OTHER: 'Other',
}
export const REGION_LABELS = {
  GLOBAL: 'Global (all corridors)', SPAIN_EU: 'Spain / European Union', INDIA: 'India', UAE_DUBAI: 'UAE / Dubai',
  LATAM: 'Latin America', USA_CAN: 'United States & Canada', MOROCCO: 'Morocco',
}

export const minutes = (seconds) => `${Math.round((Number(seconds) || 0) / 60)} min`
