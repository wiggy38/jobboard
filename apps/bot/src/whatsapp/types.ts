// ============================================================
// Incoming messages from Meta Cloud API webhook
// ============================================================

export type IncomingTextMessage = {
  type: 'text';
  from: string;
  id: string;
  text: { body: string };
};

export type IncomingInteractiveMessage = {
  type: 'interactive';
  from: string;
  id: string;
  interactive:
    | {
        type: 'button_reply';
        button_reply: { id: string; title: string };
      }
    | {
        type: 'list_reply';
        list_reply: { id: string; title: string; description?: string };
      };
};

export type IncomingMessage = IncomingTextMessage | IncomingInteractiveMessage;

// ============================================================
// Outgoing messages sent to Meta Cloud API
// ============================================================

export type TextMessage = {
  type: 'text';
  text: { body: string; preview_url?: boolean };
};

export type InteractiveButtonMessage = {
  type: 'interactive';
  interactive: {
    type: 'button';
    body: { text: string };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: { id: string; title: string };
      }>;
    };
  };
};

export type InteractiveCtaUrlMessage = {
  type: 'interactive';
  interactive: {
    type: 'cta_url';
    body: { text: string };
    action: {
      name: 'cta_url';
      parameters: { display_text: string; url: string };
    };
  };
};

export type InteractiveListMessage = {
  type: 'interactive';
  interactive: {
    type: 'list';
    body: { text: string };
    action: {
      button: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
  };
};

export type OutgoingMessage =
  | TextMessage
  | InteractiveButtonMessage
  | InteractiveCtaUrlMessage
  | InteractiveListMessage;

// ============================================================
// Parsed result from parseIncoming()
// ============================================================

export type ParsedCommand = {
  userId: string;   // E.164 phone number of the sender
  command: string;  // normalized uppercase command string
  raw: string;      // original unmodified text from the webhook
};
