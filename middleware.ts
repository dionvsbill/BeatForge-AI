import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
 let response=NextResponse.next({request});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return response;
 const supabase=createServerClient(url,key,{cookies:{
  getAll:()=>request.cookies.getAll(),
  setAll:(cookiesToSet)=>{
   cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
   response=NextResponse.next({request});
   cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
  }
 }});
 const {data:{user}}=await supabase.auth.getUser();
 const pathname=request.nextUrl.pathname;
 const isLogin=pathname==="/login";
 if(!user&&!isLogin){
  const redirect=request.nextUrl.clone();
  redirect.pathname="/login";
  redirect.search="";
  redirect.searchParams.set("next",pathname+request.nextUrl.search);
  return NextResponse.redirect(redirect);
 }
 if(user&&isLogin){
  const redirect=request.nextUrl.clone();
  const requested=request.nextUrl.searchParams.get("next");
  const safe=requested&&requested.startsWith("/")&&!requested.startsWith("//")?requested:"/dashboard";
  redirect.pathname=safe.split("?")[0];
  redirect.search=safe.includes("?")?safe.slice(safe.indexOf("?")):"";
  return NextResponse.redirect(redirect);
 }
 return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
