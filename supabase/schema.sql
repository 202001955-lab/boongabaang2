-- 붕세권 v2 스키마. Supabase → SQL Editor 에 통째로 붙여넣고 Run 한 번이면 됩니다.
-- 여러 번 실행해도 안전합니다(맨 위에서 옛 것을 먼저 정리해요). 새 프로젝트라 지워지는 데이터는 없어요.
-- 0) 옛 흔적 정리
drop policy if exists "photos upload own folder" on storage.objects;
drop view if exists spot_summary cascade;
drop table if exists reviews, favorites, shop_menu, shop_photos, sightings, shops, spot_reports, spots, profiles cascade;
drop function if exists guard_sighting() cascade;
drop function if exists guard_shop() cascade;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 10),
  cat_style jsonb,
  created_at timestamptz not null default now()
);

create table shops (
  id uuid primary key default gen_random_uuid(),
  area text not null check (char_length(area) between 1 and 60),
  name text not null check (char_length(name) between 1 and 40),
  world_x real not null check (world_x between -250 and 250),
  world_z real not null check (world_z between -250 and 250),
  landmark text check (char_length(landmark) <= 30),
  price_text text check (char_length(price_text) <= 20),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index shops_area_idx on shops(area);

create table sightings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  status text not null check (status in ('seen','not_seen')),
  created_at timestamptz not null default now()
);
create index sightings_shop_idx on sightings(shop_id, created_at desc);

create table shop_photos (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  url text not null,
  created_at timestamptz not null default now()
);

create table shop_menu (
  shop_id uuid not null references shops(id) on delete cascade,
  menu text not null check (menu in ('팥','슈크림','피자','치즈','고구마','기타')),
  primary key (shop_id, menu)
);

create table favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

-- 리뷰: 한 사람이 한 가게에 하나(다시 쓰면 덮어쓰기)
create table reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  nick text not null check (char_length(nick) between 1 and 10),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 80),
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

-- 같은 사람이 같은 가게에 30분 안에 또 제보하는 것 막기
create function guard_sighting() returns trigger language plpgsql as $$
begin
  if exists (select 1 from sightings where shop_id = new.shop_id and user_id = new.user_id and created_at > now() - interval '30 minutes') then
    raise exception 'duplicate_sighting';
  end if;
  return new;
end $$;
create trigger trg_guard_sighting before insert on sightings for each row execute function guard_sighting();

-- 같은 동네에 아주 가까운 가게 중복 등록 막기(월드 좌표 4칸 이내) + 하루 5곳 제한
create function guard_shop() returns trigger language plpgsql as $$
begin
  if exists (select 1 from shops where area = new.area and sqrt(power(world_x - new.world_x, 2) + power(world_z - new.world_z, 2)) < 4) then
    raise exception 'duplicate_shop';
  end if;
  if (select count(*) from shops where created_by = new.created_by and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_shops';
  end if;
  return new;
end $$;
create trigger trg_guard_shop before insert on shops for each row execute function guard_shop();

-- 권한(RLS): 읽기는 모두, 쓰기는 로그인(익명 포함)한 본인 이름으로만
alter table profiles enable row level security;
alter table shops enable row level security;
alter table sightings enable row level security;
alter table shop_photos enable row level security;
alter table shop_menu enable row level security;
alter table favorites enable row level security;
alter table reviews enable row level security;

create policy "profiles own" on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "shops read" on shops for select using (true);
create policy "shops insert" on shops for insert to authenticated with check (created_by = auth.uid());
create policy "sightings read" on sightings for select using (true);
create policy "sightings insert" on sightings for insert to authenticated with check (user_id = auth.uid());
create policy "photos read" on shop_photos for select using (true);
create policy "photos insert" on shop_photos for insert to authenticated with check (user_id = auth.uid());
create policy "menu read" on shop_menu for select using (true);
create policy "menu insert" on shop_menu for insert to authenticated with check (exists (select 1 from shops where id = shop_id and created_by = auth.uid()));
create policy "favorites own" on favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews read" on reviews for select using (true);
create policy "reviews insert" on reviews for insert to authenticated with check (user_id = auth.uid());
create policy "reviews update" on reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 사진 저장소(공개 읽기, 본인 폴더에만 업로드)
insert into storage.buckets (id, name, public) values ('shop-photos', 'shop-photos', true) on conflict (id) do nothing;
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 실시간으로 새 가게/제보/리뷰가 다른 사람 화면에 바로 뜨게
do $$
declare t text;
begin
  foreach t in array array['shops','sightings','reviews'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
