package utils

import (
	"strings"

	"github.com/slack-go/slack"
)

// HandleTracebackFlag extracts the --traceback flag from text and returns
// whether traceback should be included and the cleaned input text
func HandleTracebackFlag(text string) (bool, string) {
	words := strings.Fields(text)
	if len(words) > 0 && words[0] == "--traceback" {
		return true, strings.Join(words[1:], " ")
	}
	return false, text
}

// AddReaction adds a reaction to a message
func AddReaction(api *slack.Client, channel, timestamp, name string) error {
	err := api.AddReaction(name, slack.ItemRef{
		Channel:   channel,
		Timestamp: timestamp,
	})

	// Ignore "already_reacted" error
	if err != nil && !strings.Contains(err.Error(), "already_reacted") {
		return err
	}

	return nil
}

// SendSlackMessage sends a message to a Slack channel
func SendSlackMessage(api *slack.Client, channel, text, threadTS string) error {
	_, _, err := api.PostMessage(
		channel,
		slack.MsgOptionText(text, false),
		slack.MsgOptionTS(threadTS),
		slack.MsgOptionBlocks(
			slack.NewSectionBlock(
				slack.NewTextBlockObject(slack.MarkdownType, text, false, false),
				nil,
				nil,
			),
		),
	)

	return err
}

// HandleError handles an error by adding an X reaction and sending an error message
func HandleError(api *slack.Client, err error, channel, timestamp, threadTS string, messageID string) error {
	LogError(err, "")

	if err := AddReaction(api, channel, timestamp, "x"); err != nil {
		return err
	}

	errorText := err.Error()
	if messageID != "" {
		errorText = errorText + ", message_id: " + messageID
	}

	return SendSlackMessage(api, channel, "Error: "+errorText, threadTS)
}

// // CheckUserRole checks if a user has the required role
// func CheckUserRole(api *slack.Client, userID, requiredRole string) (bool, error) {
// 	user, err := api.GetUserInfo(userID)
// 	if err != nil {
// 		return false, err
// 	}

// 	// Note: slack-go library doesn't directly expose roles
// 	// This is a simplified version, you may need to check user groups instead
// 	return false, errors.New("role checking not implemented in slack-go")
// }
