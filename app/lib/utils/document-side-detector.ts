import type { UserTeam } from '../../store/current-user'

export interface DocumentTeamInfo {
  issuer_team_id?: number
  payer_team_id?: number
}

/**
 * Determines if a document is AR (Accounts Receivable) or AP (Accounts Payable)
 * based on the user's team membership and the document's team IDs
 */
export function determineDocumentSide(
  userTeams: UserTeam[],
  documentTeamInfo: DocumentTeamInfo,
  documentType: 'invoice' | 'credit_note' | 'payment'
): 'ar' | 'ap' {
  const userTeamIds = userTeams.map(team => team.team_id)
  
  // For invoices and credit notes
  if (documentType === 'invoice' || documentType === 'credit_note') {
    // If user's team is the issuer_team_id, it's AP (user is issuing the document)
    // If user's team is NOT the issuer_team_id, it's AR (user is receiving the document)
    if (documentTeamInfo.issuer_team_id && userTeamIds.includes(documentTeamInfo.issuer_team_id)) {
      return 'ap' // User is issuing the document
    } else {
      return 'ar' // User is receiving the document
    }
  }
  
  // For payments
  if (documentType === 'payment') {
    // If user's team is the payer_team_id, it's AR (user is making the payment)
    // If user's team is NOT the payer_team_id, it's AP (user is receiving the payment)
    if (documentTeamInfo.payer_team_id && userTeamIds.includes(documentTeamInfo.payer_team_id)) {
      return 'ar' // User is making the payment
    } else {
      return 'ap' // User is receiving the payment
    }
  }
  
  // Default fallback
  return 'ar'
}

/**
 * Determines if the user belongs to issuer teams
 * This is used for initial modal routing before we know the document details
 */
export function isUserIssuerTeam(userTeams: UserTeam[]): boolean {
  // For now, we'll assume all teams are issuer teams
  // This can be customized based on specific business rules
  // For example, you might check for specific team names or IDs
  
  // Example customizations:
  // 1. Check for specific team names:
  // const issuerTeamNames = ['Articulate', 'Internal Team']
  // return userTeams.some(team => issuerTeamNames.includes(team.team_name))
  
  // 2. Check for specific team IDs:
  // const issuerTeamIds = [1, 2, 3]
  // return userTeams.some(team => issuerTeamIds.includes(team.team_id))
  
  // 3. Default behavior: all teams are issuer teams
  return userTeams.length > 0
}

/**
 * Determines if the user belongs to payer teams
 * This is used for payment modal routing
 */
export function isUserPayerTeam(userTeams: UserTeam[]): boolean {
  // For payments, we assume all teams are payer teams (AR side)
  // This can be customized based on specific business rules
  
  // Example customizations:
  // 1. Check for specific team names:
  // const payerTeamNames = ['Articulate', 'Client Team']
  // return userTeams.some(team => payerTeamNames.includes(team.team_name))
  
  // 2. Check for specific team IDs:
  // const payerTeamIds = [1, 2, 3]
  // return userTeams.some(team => payerTeamIds.includes(team.team_id))
  
  // 3. Default behavior: all teams are payer teams
  return userTeams.length > 0
}
