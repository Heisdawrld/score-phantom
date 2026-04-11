import { useState, useRef, useEffect } from "react";
import { usePredictionChat } from "@/hooks/use-predictions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  fixtureId: string;
}

export function ChatInterface({ fixtureId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: "assistant", content: "I've analyzed this match. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const chatMutation = usePredictionChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMsg = input.trim();
    setInput("");
    const newHistory = [...messages, { role: "user", content: userMsg }];
    setMessages(newHistory);

    chatMutation.mutate(
      { fixtureId, message: userMsg, history: messages.slice(1) },
      {
        onSuccess: (data) => {
          setMessages([...newHistory, { role: "assistant", content: data.reply }]);
        },
        onError: () => {
          setMessages([...newHistory, { role: "assistant", content: "Sorry, I'm having trouble analyzing right now." }]);
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-[400px] bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex-1 p-4 overflow-y-auto space-y-4" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3 max-w-[85%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              msg.role === "user" ? "bg-white/10" : "bg-primary/20 text-primary"
            )}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn(
              "p-3 rounded-2xl text-sm leading-relaxed",
              msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white/5 text-foreground rounded-tl-sm"
            )}>
              {msg.content}
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-3 max-w-[85%]">
             <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
               <Bot className="w-4 h-4" />
             </div>
             <div className="p-3 rounded-2xl bg-white/5 text-foreground rounded-tl-sm flex gap-1 items-center">
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce delay-100" />
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce delay-200" />
             </div>
          </div>
        )}
      </div>
      <form onSubmit={handleSend} className="p-3 border-t border-white/5 flex gap-2 bg-panel">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this match..."
          className="bg-black/30 border-white/5 h-10"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || chatMutation.isPending} className="h-10 w-10 shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
