import { HubApp } from "@/components/HubApp";
import { routeSearchCopy } from "@/lib/route-metadata";
import { brand } from "@/lib/config";

export const metadata = {
  ...routeSearchCopy["/"],
  alternates: { canonical: brand.siteUrl },
  openGraph: { ...routeSearchCopy["/"], url: brand.siteUrl },
  twitter: routeSearchCopy["/"],
};

export default function Home() {
  return <HubApp path="/" />;
}
