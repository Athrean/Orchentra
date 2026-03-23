import { WebClient } from '@slack/web-api'
import { config } from '../config'

export const slack = new WebClient(config.delivery.slack.bot_token)
