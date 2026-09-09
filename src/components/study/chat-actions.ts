import {
  AlignLeft,
  TextSearch,
  HelpCircle,
  Route,
  MessageCircle,
} from "lucide-react";
export const actions = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Bring the key ideas together",
    icon: AlignLeft,
  },
  {
    id: "rewrite",
    label: "Explain in more detail",
    description: "Build a fuller explanation",
    icon: TextSearch,
  },
  {
    id: "quiz",
    label: "Test me",
    description: "Find out what has stayed with you",
    icon: HelpCircle,
  },
  {
    id: "next",
    label: "What should I learn next?",
    description: "Explore the next useful connection",
    icon: Route,
  },
  {
    id: "clarify",
    label: "Clarify a passage",
    description: "Work through it, step by step",
    icon: MessageCircle,
  },
];
