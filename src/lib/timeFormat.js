import { formatDistanceToNowStrict } from 'date-fns'
import { ko, enUS, ja } from 'date-fns/locale'
import i18n from '../i18n'

const localeMap = { ko, en: enUS, ja }

function getLocale() {
  const lang = i18n.language?.split('-')[0] || 'en'
  return localeMap[lang] || enUS
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  return formatDistanceToNowStrict(new Date(dateStr), {
    addSuffix: true,
    locale: getLocale(),
  })
}

export function formatChatTime(dateStr) {
  if (!dateStr) return ''
  const lang = i18n.language?.split('-')[0] || 'en'
  return new Intl.DateTimeFormat(lang, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateStr))
}
