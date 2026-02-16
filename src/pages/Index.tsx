import { Header } from "@/components/Header";
import { SingleStockTab } from "@/components/SingleStockTab";
import { ScreenerTab } from "@/components/ScreenerTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="single" className="space-y-8">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="single" className="font-mono text-sm data-[state=active]:bg-background data-[state=active]:text-primary">
              Single Stock
            </TabsTrigger>
            <TabsTrigger value="screener" className="font-mono text-sm data-[state=active]:bg-background data-[state=active]:text-primary">
              S&P 500 Screener
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
            <SingleStockTab />
          </TabsContent>
          <TabsContent value="screener">
            <ScreenerTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
