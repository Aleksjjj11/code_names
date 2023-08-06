create table if not exists users
(
    id INTEGER,
    login TEXT not null,
    password TEXT not null,
    primary key (id)
);