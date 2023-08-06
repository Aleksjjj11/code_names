create table if not exists dicts
(
    id INTEGER,
    uid INTEGER,
    name TEXT not null,
    words TEXT not null,
    likes INTEGER,
    primary key (id),
    foreign key (uid) references users
);