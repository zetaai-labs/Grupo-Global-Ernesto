// French dictionary. The English text is the key; missing keys fall back to English.
import fr1 from './fr.1'
import fr2 from './fr.2'
import fr3 from './fr.3'
import fr4 from './fr.4'
import fr5 from './fr.5'
import fr6 from './fr.6'
import { privacyFr } from './privacy'
import { membershipFr } from './membership'
import { assistantFr } from './assistant'
import { auditFr } from './audit'
import { callCenterFr } from './callcenter'
import { privateChatFr } from './privatechat'
import { userMgmtFr } from './usermgmt'
import { presidentialFr } from './presidential'
import { extranetHubFr } from './extranethub'

export default { ...fr1, ...fr2, ...fr3, ...fr4, ...fr5, ...fr6, ...privacyFr, ...membershipFr, ...assistantFr, ...auditFr, ...callCenterFr, ...privateChatFr, ...userMgmtFr, ...presidentialFr, ...extranetHubFr }
